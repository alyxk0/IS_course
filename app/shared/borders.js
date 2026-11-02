import { contains, validRange } from "./ranges.js";
import { sameCell } from "./cellEquality.js";

export const BORDER_SIDES = ["top", "right", "bottom", "left"];
export const BORDER_LINES = { thin: [1, "solid"], medium: [2, "solid"], thick: [3, "solid"], dashed: [1, "dashed"], dotted: [1, "dotted"], double: [3, "double"] };
const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" };
const step = { top: [-1, 0], bottom: [1, 0], left: [0, -1], right: [0, 1] };
const legacy = { color: "#5f6368", line: "thin" };
export function validBorders(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.entries(value).every(([side, edge]) =>
    BORDER_SIDES.includes(side) && (edge === null || (edge && typeof edge === "object" && !Array.isArray(edge) &&
      Object.keys(edge).length === 2 && Object.hasOwn(BORDER_LINES, edge.line) && /^#[0-9a-f]{6}$/i.test(edge.color))),
  );
}
export function mergeStyles(previous = {}, patch = {}, replace = false) {
  const result = { ...(replace ? {} : previous), ...patch };
  for (const key of ["color", "background"]) if (patch[key] === null) delete result[key];
  if (patch.borders) result.borders = { ...(!replace ? previous.borders : {}), ...patch.borders };
  if (Object.hasOwn(patch, "border") && !Object.hasOwn(patch, "borders")) delete result.borders;
  if (Object.hasOwn(patch, "wrap") && !Object.hasOwn(patch, "wrapMode")) delete result.wrapMode;
  return result;
}
export function withoutBorders(cell = {}) {
  const next = { ...cell };
  if (next.style) {
    next.style = { ...next.style }; delete next.style.border; delete next.style.borders;
    if (!Object.keys(next.style).length) delete next.style;
  }
  return next;
}
const mergedAt = (sheet, r, c) => sheet.merges?.find((m) => contains(m, r, c));
export function ownBorder(sheet, r, c, side) {
  const style = sheet.cells[`${r},${c}`]?.style || {};
  if (Object.hasOwn(style.borders || {}, side)) return style.borders[side];
  if (style.border) return legacy;
  const merge = mergedAt(sheet, r, c);
  if (merge && sheet.cells[`${merge.r},${merge.c}`]?.style?.border &&
    ((side === "top" && r === merge.r) || (side === "bottom" && r === merge.r2) || (side === "left" && c === merge.c) || (side === "right" && c === merge.c2))) return legacy;
  return null;
}
export function borderAt(sheet, r, c, side) {
  const [dr, dc] = step[side], own = ownBorder(sheet, r, c, side), other = ownBorder(sheet, r + dr, c + dc, opposite[side]);
  if (!own) return other; if (!other) return own;
  const a = BORDER_LINES[own.line][0], b = BORDER_LINES[other.line][0];
  if (a !== b) return a > b ? own : other;
  // Right/bottom cell wins a tie, independently of which cell draws the edge.
  return side === "top" || side === "left" ? own : other;
}
export function borderCss(edge) {
  return edge ? `${BORDER_LINES[edge.line][0]}px ${BORDER_LINES[edge.line][1]} ${edge.color}` : "none";
}
export function captureCellStyle(sheet, r, c) {
  const style = structuredClone(sheet.cells[`${r},${c}`]?.style || {}), borders = Object.fromEntries(BORDER_SIDES.map((side) => [side, borderAt(sheet, r, c, side)]));
  if (Object.values(borders).some(Boolean)) style.borders = borders;
  return style;
}
export function borderChanges(sheet, range, preset, edge) {
  if (edge) edge = { line: edge.line, color: edge.color };
  if (!validRange(range, sheet.rows, sheet.cols) || (range.r2 - range.r + 1) * (range.c2 - range.c + 1) > 20000)
    throw new Error("Выберите диапазон не более 20 000 ячеек");
  const changes = new Map();
  const set = (r, c, side, value) => {
    if (r < 0 || c < 0 || r >= sheet.rows || c >= sheet.cols) return;
    const key = `${r},${c}`;
    if (!changes.has(key)) changes.set(key, { key, cell: { style: { borders: {} } } });
    changes.get(key).cell.style.borders[side] = value;
  };
  const shared = (r, c, side) => {
    const [dr, dc] = step[side], merge = mergedAt(sheet, r, c);
    if (preset !== "clear" && merge && contains(merge, r + dr, c + dc)) return;
    set(r, c, side, preset === "clear" ? null : edge);
    set(r + dr, c + dc, opposite[side], preset === "clear" ? null : edge);
  };
  for (let r = range.r; r <= range.r2 + 1; r++) for (let c = range.c; c <= range.c2; c++) {
    const inside = r > range.r && r <= range.r2;
    if (preset === "all" || preset === "clear" || (inside && ["inner", "horizontal"].includes(preset)) ||
      (!inside && preset === "outer") || (r === range.r && preset === "top") || (r === range.r2 + 1 && preset === "bottom")) shared(r - 1, c, "bottom");
  }
  for (let c = range.c; c <= range.c2 + 1; c++) for (let r = range.r; r <= range.r2; r++) {
    const inside = c > range.c && c <= range.c2;
    if (preset === "all" || preset === "clear" || (inside && ["inner", "vertical"].includes(preset)) ||
      (!inside && preset === "outer") || (c === range.c && preset === "left") || (c === range.c2 + 1 && preset === "right")) shared(r, c - 1, "right");
  }
  return [...changes.values()];
}

// Style replacement, copying, and format painting must update the opposite
// side of a shared edge too. Unrelated font/value edits leave borders alone.
export function synchronizeBorders(sheet, input) {
  const changes = new Map(input.map((change) => [change.key, structuredClone(change)]));
  const set = (r, c, side, edge) => {
    if (r < 0 || c < 0 || r >= sheet.rows || c >= sheet.cols) return;
    const key = `${r},${c}`;
    if (!changes.has(key)) changes.set(key, { key, cell: { style: { borders: {} } } });
    const change = changes.get(key);
    if (change.cell === null) return;
    change.cell.style ??= {};
    if (edge === null && (change.replaceStyle || change.replace) && !change.cell.style.border && !Object.hasOwn(change.cell.style.borders || {}, side)) return;
    change.cell.style.borders = { ...change.cell.style.borders, [side]: edge };
  };
  for (const change of input) {
    const patch = change.cell?.style || {}, [r, c] = change.key.split(",").map(Number), previous = sheet.cells[change.key] || {};
    if (!change.replace && !change.replaceStyle && change.cell !== null && !Object.hasOwn(patch, "borders") && !Object.hasOwn(patch, "border")) continue;
    const next = change.cell === null ? {} : mergeStyles(change.replace ? {} : previous.style, patch, change.replace || change.replaceStyle);
    const merge = mergedAt(sheet, r, c);
    // Reset hidden perimeter metadata when replacing a merged anchor's format.
    if (merge && merge.r === r && merge.c === c && (change.replaceStyle || change.replace || change.cell === null)) {
      for (const entry of borderChanges(sheet, merge, "clear", null)) {
        const [rr, cc] = entry.key.split(",").map(Number);
        for (const side of Object.keys(entry.cell.style.borders)) {
          if (borderAt(sheet, rr, cc, side)) set(rr, cc, side, null);
        }
      }
      for (const side of BORDER_SIDES) {
        const edge = Object.hasOwn(next.borders || {}, side) ? next.borders[side] : next.border ? legacy : null;
        if (!edge) continue;
        const points = side === "top" || side === "bottom"
          ? Array.from({ length: merge.c2 - merge.c + 1 }, (_, i) => [side === "top" ? merge.r : merge.r2, merge.c + i])
          : Array.from({ length: merge.r2 - merge.r + 1 }, (_, i) => [merge.r + i, side === "left" ? merge.c : merge.c2]);
        for (const [rr, cc] of points) { const [dr, dc] = step[side]; set(rr, cc, side, edge); set(rr + dr, cc + dc, opposite[side], edge); }
      }
    }
    for (const side of BORDER_SIDES) {
      const old = borderAt(sheet, r, c, side), edge = Object.hasOwn(next.borders || {}, side) ? next.borders[side] : next.border ? legacy : null;
      if (sameCell(old, edge)) continue;
      const [dr, dc] = step[side];
      set(r, c, side, edge);
      set(r + dr, c + dc, opposite[side], edge);
    }
  }
  return [...changes.values()];
}
