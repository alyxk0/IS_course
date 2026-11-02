export const intersects = (a, b) =>
  a.r <= b.r2 && a.r2 >= b.r && a.c <= b.c2 && a.c2 >= b.c;
export const contains = (range, r, c) =>
  r >= range.r && r <= range.r2 && c >= range.c && c <= range.c2;
export function validRange(range, rows = 10000, cols = 200) {
  return (
    range &&
    ["r", "r2", "c", "c2"].every((k) => Number.isInteger(range[k])) &&
    range.r >= 0 &&
    range.c >= 0 &&
    range.r2 >= range.r &&
    range.c2 >= range.c &&
    range.r2 < rows &&
    range.c2 < cols
  );
}
export function usedRange(sheet) {
  let r2 = 0,
    c2 = 0;
  for (const [key, cell] of Object.entries(sheet.cells))
    if (cell.value) {
      const [r, c] = key.split(",").map(Number);
      r2 = Math.max(r2, r);
      c2 = Math.max(c2, c);
    }
  return { r: 0, c: 0, r2, c2 };
}
export function shiftRange(range, axis, index, count, remove) {
  const start = axis === "row" ? "r" : "c",
    end = axis === "row" ? "r2" : "c2",
    next = { ...range };
  if (remove) {
    const remaining = [];
    for (let n = range[start]; n <= range[end]; n++)
      if (n < index || n >= index + count)
        remaining.push(n >= index ? n - count : n);
    if (!remaining.length) return null;
    next[start] = remaining[0];
    next[end] = remaining[remaining.length - 1];
  } else if (index <= range[start]) {
    next[start] += count;
    next[end] += count;
  } else if (index <= range[end]) next[end] += count;
  return next;
}
