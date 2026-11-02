export function mergeRanges(range, mode = "all") {
  if (mode === "horizontal")
    return range.c < range.c2 ? Array.from({ length: range.r2 - range.r + 1 }, (_, i) => ({ ...range, r: range.r + i, r2: range.r + i })) : [];
  if (mode === "vertical")
    return range.r < range.r2 ? Array.from({ length: range.c2 - range.c + 1 }, (_, i) => ({ ...range, c: range.c + i, c2: range.c + i })) : [];
  return range.r < range.r2 || range.c < range.c2 ? [{ ...range }] : [];
}
export function mergeDropsValue(range, mode, r, c) {
  if (r < range.r || r > range.r2 || c < range.c || c > range.c2) return false;
  return mode === "horizontal" ? c !== range.c : mode === "vertical" ? r !== range.r : r !== range.r || c !== range.c;
}
