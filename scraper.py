# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "pandas",
# ]
# ///
from __future__ import annotations

import json
import os
import tarfile
from datetime import datetime, timezone
from io import BytesIO
from urllib.request import urlopen

import pandas as pd


def get_data() -> dict:
    """Return browser compat data, downloading if needed."""
    if os.path.exists("data.json"):
        with open("data.json") as fh:
            return json.load(fh)
    meta = json.load(urlopen("https://registry.npmjs.org/@mdn/browser-compat-data/latest"))
    with urlopen(meta["dist"]["tarball"]) as resp:
        with tarfile.open(fileobj=BytesIO(resp.read()), mode="r:gz") as tgz:
            content = tgz.extractfile("package/data.json").read()
    with open("data.json", "wb") as fh:
        fh.write(content)
    return json.loads(content)


def build_timelines(data: dict) -> pd.DataFrame:
    """Create the timelines data frame."""
    release_dates = {
        (b, r): v["release_date"]
        for b in data["browsers"]
        for r, v in data["browsers"][b]["releases"].items()
        if "release_date" in v
    }
    records: list[dict] = []
    for feature, sub in data["api"].items():
        for key, val in sub.items():
            support = val["support"] if key == "__compat" else val["__compat"]["support"]
            for browser, impl in support.items():
                impl = impl[0] if isinstance(impl, list) else impl
                version = impl.get("version_added")
                if not version or (browser, version) not in release_dates:
                    continue
                records.append({
                    "feature": feature,
                    "subfeature": "" if key == "__compat" else key,
                    "browser": browser,
                    "version": version,
                    "date": release_dates[browser, version],
                })
    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["date"])
    df["delay"] = df.groupby([df.feature, df.subfeature])["date"].transform(lambda x: (x - x.min()).dt.days)
    df["rank"] = df.groupby([df.feature, df.subfeature])["delay"].rank()
    df = df[~df.browser.isin(["oculus", "deno", "nodejs"])]
    return df[["date", "browser", "delay", "rank"]].sort_values(["date", "browser"])


def save_last_updated(data: dict) -> None:
    """Write last update timestamp."""
    ts = data.get("__meta", {}).get("timestamp")
    if not ts:
        ts = datetime.now(timezone.utc).isoformat()
    with open("last-updated.json", "w") as fh:
        json.dump({"timestamp": ts}, fh)


def main() -> None:
    """Generate timelines and update timestamp."""
    data = get_data()
    save_last_updated(data)
    build_timelines(data).to_csv("timelines.csv", index=False)


if __name__ == "__main__":
    main()
