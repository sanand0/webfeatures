import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const updatedEl = document.getElementById("last-updated");
updatedEl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
fetch("last-updated.json")
  .then((r) => r.json())
  .then((d) => {
    const date = new Date(d.timestamp);
    updatedEl.textContent = `Last updated on ${date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`;
  })
  .catch(() => {
    updatedEl.textContent = "Update date unavailable";
  });

const xGap = 50;
const yGap = 25;
const margin = { top: 110, right: 30, bottom: 20, left: 60 };

// Pre-process data
const processData = (rawData) => {
  const years = d3.groups(rawData, (d) => d.date.getFullYear()).map((d) => d[0]);
  const allBrowsers = [...new Set(rawData.map((d) => d.browser))];

  const data = years.map((year) => {
    const yearData = rawData.filter((d) => d.date.getFullYear() === year);
    const browserMetrics = {};

    allBrowsers.forEach((browser) => {
      const browserData = yearData.filter((d) => d.browser === browser);
      browserMetrics[browser] = {
        delay: Math.round(d3.mean(browserData, (d) => d.delay) || 0),
        rank: +(d3.mean(browserData, (d) => d.rank) || 0).toFixed(2),
        count: browserData.length,
      };
    });

    return { year, ...browserMetrics };
  });

  // This is the order I want browsers in
  const browsers = [
    "ie",
    "opera",
    "safari",
    "firefox",
    "chrome",
    "edge",
    "webview_ios",
    "safari_ios",
    "webview_android",
    "opera_android",
    "firefox_android",
    "chrome_android",
    "samsunginternet_android",
  ];

  return { data, browsers };
};

// Setup scales and other constants
const setupScales = (data, browsers) => {
  const delayBreakpoints = [50, 300, 600, 1000, 1800];
  const colors = ["black", "lime", "yellow", "orange", "red"];
  const colorScale = d3.scaleLinear().domain(delayBreakpoints).range(colors).interpolate(d3.interpolateRgb.gamma(0.8));

  const maxCount = d3.max(data, (d) => d3.max(browsers, (b) => d[b]?.count || 0));
  const sizeScale = d3.scaleSqrt().domain([0, maxCount]).range([0, 20]);

  return { colorScale, sizeScale };
};

// Initialize SVG and container
const initializeSVG = () => {
  const container = d3.select("#metric-bubbles").style("overflow-x", "auto").style("width", "100%");

  // Create tooltip if it doesn't exist
  if (!d3.select("body").select(".tooltip").size()) d3.select("body").append("div").attr("class", "tooltip");

  return container;
};

function highlight({ minYear, maxYear, ...rest }) {
  const svg = d3.select("#metric-bubbles svg g");

  // Remove existing highlights
  svg.selectAll(".highlight-rect").remove();

  rest.browsers.forEach((browser) => {
    const browserIndex = browsers.indexOf(browser);
    if (browserIndex === -1) return;

    const startY = data.findIndex((d) => d.year === minYear) * yGap;
    const endY = (data.findIndex((d) => d.year === maxYear) + 1) * yGap;

    svg
      .append("rect")
      .attr("class", "highlight-rect")
      .attr("x", browserIndex * xGap)
      .attr("y", startY)
      .attr("width", xGap)
      .attr("height", endY - startY)
      .style("pointer-events", "none");
  });
}

function drawBubbles(maxYear) {
  const filteredData = data.filter((d) => d.year <= maxYear);
  const width = browsers.length * xGap;
  const height = filteredData.length * yGap;

  const container = d3.select("#metric-bubbles");
  let svg = container.select("svg");

  // Create SVG if it doesn't exist
  if (svg.empty()) {
    svg = container.append("svg").attr("fill", "currentColor");
    svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  }

  svg.attr("width", width + margin.left + margin.right).attr("height", height + margin.top + margin.bottom);

  const g = svg.select("g");

  // Update grid lines
  g.selectAll(".v-grid")
    .data(browsers)
    .join("line")
    .attr("class", "v-grid")
    .attr("x1", (d, i) => (i + 0.5) * xGap)
    .attr("x2", (d, i) => (i + 0.5) * xGap)
    .attr("y1", 0)
    .attr("y2", height);

  g.selectAll(".h-grid")
    .data(filteredData)
    .join("line")
    .attr("class", "h-grid")
    .attr("x1", 0)
    .attr("x2", width)
    .attr("y1", (d, i) => (i + 0.5) * yGap)
    .attr("y2", (d, i) => (i + 0.5) * yGap);

  // Render circles for each browser
  browsers.forEach((browser, browserIndex) => renderCircle(g, browser, browserIndex, filteredData));

  // Add single event listener to the container
  const handleTooltip = (event, show) => {
    const target = event.target;
    if (target.tagName !== "circle") return;

    const tooltip = d3.select(".tooltip");

    if (show) {
      const browser = target.getAttribute("data-browser");
      const data = d3.select(target).datum();
      const browserData = data[browser];
      if (!browserData) return;

      tooltip
        .style("opacity", 1)
        .html(formatTooltipContent(browser, data))
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 10 + "px");

      d3.select(target).classed("circle-highlight", true);
    } else {
      tooltip.style("opacity", 0);
      d3.select(target).classed("circle-highlight", false);
    }
  };

  // Update the event listeners
  g.on("mouseover", (e) => handleTooltip(e, true))
    .on("mouseout", (e) => handleTooltip(e, false))
    .on("mousemove", (event) => {
      if (event.target.tagName === "circle") {
        d3.select(".tooltip")
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 10 + "px");
      }
    });

  // Update labels
  g.selectAll(".year-label")
    .data(filteredData)
    .join("text")
    .attr("class", "year-label")
    .attr("x", -10)
    .attr("y", (d, i) => (i + 0.5) * yGap)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .text((d) => d.year);

  g.selectAll(".browser-label")
    .data(browsers)
    .join("text")
    .attr("class", "browser-label")
    .attr("x", (d, i) => (i + 0.5) * xGap)
    .attr("y", -10)
    .attr("text-anchor", "start")
    .attr("transform", (d, i) => `rotate(-30, ${(i + 0.5) * xGap}, 0)`)
    .text((d) => d);
}

const renderCircle = (g, browser, browserIndex, filteredData) => {
  return g
    .selectAll(`.circle-${browser}`)
    .data(filteredData)
    .join("circle")
    .attr("cx", (browserIndex + 0.5) * xGap)
    .attr("cy", (d, i) => (i + 0.5) * yGap)
    .attr("r", (d) => sizeScale(d[browser]?.count || 0))
    .attr("fill", (d) => (d[browser]?.count ? colorScale(d[browser].delay) : "none"))
    .attr("data-browser", browser);
};

const formatTooltipContent = (browser, data) => {
  const browserName = browser.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  return `
    <div style="font-family: sans-serif; line-height: 1.4">
      <strong style="font-size: 14px">${browserName}</strong>
      <br/>
      <span style="color: #666">Year: ${data.year}</span>
      <br/>
      <span style="color: #666">Features Released: ${data[browser].count}</span>
      <br/>
      <span style="color: #666">Average Delay: ${data[browser].delay} days</span>
      <br/>
      <span style="color: #666">Average Rank: ${data[browser].rank.toFixed(2)}</span>
    </div>
  `;
};

// Load and process the data
const rawData = await d3.csv("./timelines.csv", (d) => ({
  date: new Date(d.date),
  browser: d.browser,
  delay: +d.delay,
  rank: +d.rank,
}));

// Initialize global variables
const { data, browsers } = processData(rawData);
const { colorScale, sizeScale } = setupScales(data, browsers);
initializeSVG();
drawBubbles(data[data.length - 1].year);

// Set up scrollytelling
const options = { root: null, threshold: 0 };
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      document.querySelectorAll(".story-card").forEach((card) => card.classList.remove("active"));
      entry.target.classList.add("active");
      const { from, to, browsers } = entry.target.dataset;
      highlight({ minYear: +from, maxYear: +to, browsers: browsers.split(/,\s*/) });
    }
  });
}, options);

// Observe all story cards
document.querySelectorAll(".story-card").forEach((card) => observer.observe(card));
