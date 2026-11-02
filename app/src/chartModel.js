import { colName } from "./api.js";
export const SERIES_COLORS = [
  "#4285f4",
  "#db4437",
  "#f4b400",
  "#0f9d58",
  "#ab47bc",
  "#ff6d00",
  "#00acc1",
  "#5c6bc0",
];
export function chartData(chart, getValue, visible = () => true) {
  const range = chart.range,
    start = range.r + (chart.header ? 1 : 0),
    firstSeries = range.c + (chart.labels ? 1 : 0),
    rows = [];
  for (let r = start; r <= range.r2; r++)
    if (chart.includeHidden || visible(r)) rows.push(r);
  const labels = rows.map((r, i) =>
    chart.labels ? String(getValue(r, range.c) ?? "") : String(i + 1),
  );
  const x = rows.map((r) => getValue(r, range.c));
  const series = [];
  for (let c = firstSeries; c <= range.c2; c++) {
    const name = chart.header
      ? String(getValue(range.r, c) ?? "") || colName(c)
      : `Ряд ${series.length + 1}`;
    series.push({
      name,
      color: SERIES_COLORS[series.length % SERIES_COLORS.length],
      values: rows.map((r) => {
        const v = getValue(r, c);
        return typeof v === "number" && Number.isFinite(v) ? v : null;
      }),
    });
  }
  return { labels, rows, x, series };
}
export function chartDomain(series) {
  let min = 0,
    max = 0;
  for (const s of series)
    for (const v of s.values)
      if (v !== null && Number.isFinite(v)) {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
  if (min === max) return { min: 0, max: 1 };
  const step = niceStep(max / 4 - min / 4),
    lower = Math.floor(min / step) * step,
    upper = Math.ceil(max / step) * step;
  return {
    min: Number.isFinite(lower) ? lower : min,
    max: Number.isFinite(upper) ? upper : max,
  };
}
function niceStep(value) {
  const magnitude = 10 ** Math.floor(Math.log10(value)) || Number.MIN_VALUE,
    fraction = value / magnitude;
  return ([1, 2, 2.5, 5, 10].find((n) => n >= fraction) || 10) * magnitude;
}
export function chartTicks({ min, max }) {
  const step = niceStep(max / 4 - min / 4),
    start = Math.ceil(min / step),
    ticks = [];
  for (let i = 0; i < 12; i++) {
    const value = (start + i) * step;
    if (!Number.isFinite(value) || value > max + Math.abs(max) * 1e-12) break;
    ticks.push(Number(value.toPrecision(12)));
  }
  return ticks;
}
export function chartRatio(value, min, max) {
  const scale = Math.max(Math.abs(min), Math.abs(max)) || 1;
  return (value / scale - min / scale) / (max / scale - min / scale || 1);
}
