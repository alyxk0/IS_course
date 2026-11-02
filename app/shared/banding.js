import { contains, validRange } from "./ranges.js";
export function normalizeBanding(input, rows = 10000, cols = 200) {
  if (!input || !validRange(input.range, rows, cols)) throw new Error("Проверьте диапазон чередования цветов");
  const result = { range: Object.fromEntries(["r", "r2", "c", "c2"].map((k) => [k, input.range[k]])) };
  for (const key of ["header", "first", "second", "footer"]) {
    const value = input[key];
    if ((key === "header" || key === "footer") && value === null) result[key] = null;
    else if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) result[key] = value.toLowerCase();
    else throw new Error("Выберите цвет каждой полосы");
  }
  return result;
}
export function bandingColor(rule, r) {
  if (r < rule.range.r || r > rule.range.r2) return null;
  if (r === rule.range.r && rule.header) return rule.header;
  if (r === rule.range.r2 && rule.footer) return rule.footer;
  return (r - rule.range.r - (rule.header ? 1 : 0)) % 2 === 0 ? rule.first : rule.second;
}
export function bandingStyle(sheet, r, c) {
  const rule = sheet?.bandedRanges?.find((item) => contains(item.range, r, c));
  return rule ? { background: bandingColor(rule, r) } : {};
}
export function bandingDataRange(sheet, selection) {
  const range = { ...selection }, filled = (r, c) => !!sheet.cells[`${r},${c}`]?.value;
  if (range.r !== range.r2 || range.c !== range.c2 || !filled(range.r, range.c)) return range;
  let changed;
  do {
    changed = false;
    for (const [side, delta, size] of [["r", -1, sheet.rows], ["r2", 1, sheet.rows], ["c", -1, sheet.cols], ["c2", 1, sheet.cols]]) {
      const next = range[side] + delta;
      if (next < 0 || next >= size) continue;
      const row = side.startsWith("r"), first = row ? range.c : range.r, last = row ? range.c2 : range.r2;
      for (let n = first; n <= last; n++) if (filled(row ? next : n, row ? n : next)) { range[side] = next; changed = true; break; }
    }
  } while (changed);
  return range;
}
