# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "pandas",
# ]
# ///
import os
import json
import pandas as pd
from urllib.request import urlretrieve


if not os.path.exists("data.json"):
    url ='https://cdn.jsdelivr.net/npm/@mdn/browser-compat-data@6.0.0/data.json'
    urlretrieve(url, 'data.json')

with open('data.json') as handle:
    data = json.load(handle)

release_dates = {}
for browser in data['browsers']:
    for release, val in data['browsers'][browser]['releases'].items():
        if 'release_date' in val:
            release_dates[browser, release] = val['release_date']

releases = []
for feature in data['api']:
    for key, value in data["api"][feature].items():
        support = value['support'] if key == '__compat' else value['__compat']['support']
        for browser, impl in support.items():
            browser_impl = impl[0] if isinstance(impl, list) else impl
            version = browser_impl['version_added']
            if 'version_added' not in browser_impl or (browser, version) not in release_dates:
                continue
            releases.append({
                'feature': feature,
                'subfeature': '' if key == '__compat' else key,
                'browser': browser,
                'version': version,
                'date': release_dates[browser, version]
            })

df = pd.DataFrame(releases)
df['date'] = pd.to_datetime(df['date'])
df['delay'] = df.groupby([df.feature, df.subfeature])['date'].transform(lambda x: (x - x.min()).dt.days)
df['rank'] = df.groupby([df.feature, df.subfeature])['delay'].rank()

# Pick columns we're interested in. Sort for compression
timelines = df[['date', 'browser', 'delay', 'rank']].sort_values(['date', 'browser'])
# Skip browsers we are not interested in
timelines = timelines[~timelines.browser.isin(['oculus', 'deno', 'nodejs'])]
timelines.to_csv('timelines.csv', index=False)
# df[df['date'].dt.year == 2023].groupby('browser').agg({'delay': 'mean', 'rank': 'mean', 'feature': 'count'})
