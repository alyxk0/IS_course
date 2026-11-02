import { contains, intersects, usedRange } from "../shared/ranges.js";
import { wrapMode } from "../shared/textWrapping.js";
import { validationAt } from "../shared/rules.js";

export function mergeAt(sheet, r, c) {
  return sheet?.merges?.find((range) => contains(range, r, c));
}
export const ROW_HEIGHT = 21;
export function expandSelection(sheet, range) {
  let expanded = { ...range },
    changed = true;
  while (changed) {
    changed = false;
    for (const m of sheet.merges || [])
      if (intersects(expanded, m)) {
        const next = {
          r: Math.min(expanded.r, m.r),
          r2: Math.max(expanded.r2, m.r2),
          c: Math.min(expanded.c, m.c),
          c2: Math.max(expanded.c2, m.c2),
        };
        if (Object.keys(next).some((k) => next[k] !== expanded[k])) {
          expanded = next;
          changed = true;
        }
      }
  }
  return expanded;
}
let canvas;
export function textWidth(text, style) {
  if (typeof document === "undefined")
    return text.length * (style.fontSize || 10) * 0.7;
  canvas ??= document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `${style.bold ? "bold " : ""}${style.italic ? "italic " : ""}${((style.fontSize || 10) * 4) / 3}px ${style.fontFamily || "Arial"}`;
  return ctx.measureText(text).width;
}
const graphemeSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("ru", { granularity: "grapheme" })
    : null;
export const textGraphemes = (text) =>
  graphemeSegmenter
    ? [...graphemeSegmenter.segment(text)].map((s) => s.segment)
    : [...text];
export function rotatedTextMetrics(text, style) {
  const lines = String(text).split("\n"),
    line = Math.ceil(((style.fontSize || 10) * 4) / 3 + 3);
  const width = Math.max(...lines.map((part) => textWidth(part, style)), 0),
    height = lines.length * line;
  if (style.rotation === "vertical")
    return {
      width: lines.length * line,
      height:
        Math.max(...lines.map((part) => textGraphemes(part).length), 1) * line,
      line,
    };
  const angle = (Number(style.rotation || 0) * Math.PI) / 180;
  return {
    width: Math.ceil(
      width * Math.abs(Math.cos(angle)) + height * Math.abs(Math.sin(angle)),
    ),
    height: Math.ceil(
      width * Math.abs(Math.sin(angle)) + height * Math.abs(Math.cos(angle)),
    ),
    line,
  };
}
export function wrappedLines(text, width, style) {
  let lines = 0;
  for (const paragraph of String(text).split("\n")) {
    let lineWidth = 0;
    lines++;
    for (const word of paragraph.split(/\s+/)) {
      const wordWidth = textWidth(word, style),
        space = lineWidth ? textWidth(" ", style) : 0;
      if (lineWidth && lineWidth + space + wordWidth > width) {
        lines++;
        lineWidth = 0;
      }
      if (wordWidth > width) {
        for (const char of textGraphemes(word)) {
          const w = textWidth(char, style);
          if (lineWidth + w > width) {
            lines++;
            lineWidth = 0;
          }
          lineWidth += w;
        }
      } else lineWidth += (lineWidth ? space : 0) + wordWidth;
    }
  }
  return lines;
}
export function buildLayout(
  sheet,
  getText,
  printing = false,
  styleFor = () => ({}),
) {
  if (!sheet) return null;
  const heights = Array(sheet.rows).fill(ROW_HEIGHT);
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const [r, c] = key.split(",").map(Number),
      s = { ...cell.style, ...styleFor(r, c) };
    if (r >= sheet.rows) continue;
    let height = Math.max(
      ROW_HEIGHT,
      Math.ceil(((s.fontSize || 10) * 4) / 3 + 6),
    );
    const lineHeight = Math.ceil(((s.fontSize || 10) * 4) / 3 + 3);
    const manualLines = String(getText(r, c)).split("\n").length;
    if (manualLines > 1) height = Math.max(height, manualLines * lineHeight + 4);
    if (wrapMode(s) === "wrap") {
      const merge = mergeAt(sheet, r, c);
      if (merge && merge.r !== merge.r2) continue;
      const width = merge
        ? Array.from(
            { length: merge.c2 - merge.c + 1 },
            (_, i) => sheet.widths[merge.c + i] || 100,
          ).reduce((a, b) => a + b, 0)
        : sheet.widths[c] || 100;
      const lines = wrappedLines(getText(r, c), Math.max(20, width - 8), s);
      height = Math.min(
        400,
        Math.max(
          height,
          lines * Math.ceil(((s.fontSize || 10) * 4) / 3 + 3) + 4,
        ),
      );
    }
    if (s.rotation) {
      height = Math.max(
        height,
        Math.min(400, rotatedTextMetrics(getText(r, c), s).height + 4),
      );
    }
    heights[r] = Math.max(heights[r], height);
  }
  for (const [r, height] of Object.entries(sheet.heights || {}))
    heights[r] = height;
  const filter = sheet.filter,
    criteria = Object.entries(filter?.criteria || {}).map(([c, rule]) => [
      +c,
      new Set(rule.values),
    ]);
  const used = usedRange(sheet);
  for (const m of sheet.merges || []) {
    used.r2 = Math.max(used.r2, m.r2);
    used.c2 = Math.max(used.c2, m.c2);
  }
  const count = printing ? used.r2 + 1 : sheet.rows;
  const rows = [],
    positions = Array(sheet.rows).fill(-1),
    offsets = [0];
  for (let r = 0; r < count; r++) {
    if (
      filter &&
      r > filter.range.r &&
      r <= filter.range.r2 &&
      !criteria.every(([c, values]) => values.has(String(getText(r, c))))
    )
      continue;
    positions[r] = rows.length;
    rows.push(r);
    offsets.push(offsets[offsets.length - 1] + heights[r]);
  }
  return {
    rows,
    positions,
    offsets,
    heights,
    used,
    cols: printing ? used.c2 + 1 : sheet.cols,
    frozenCount: printing
      ? 0
      : rows.filter((r) => r < (sheet.frozen || 0)).length,
  };
}
export function windowRows(
  sheet,
  layout,
  scrollTop,
  viewport,
  zoom,
  printing = false,
) {
  let start = 0,
    end = layout.rows.length;
  if (!printing) {
    const y = (scrollTop * 100) / zoom;
    let low = 0,
      high = layout.rows.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (layout.offsets[mid + 1] < y) low = mid + 1;
      else high = mid;
    }
    start = Math.max(layout.frozenCount, low - 5);
    end = Math.min(
      layout.rows.length,
      start + Math.ceil((viewport * 100) / zoom / ROW_HEIGHT) + 12,
    );
    let changed = true;
    while (changed) {
      changed = false;
      for (const m of sheet.merges || []) {
        const a = layout.positions[m.r],
          b = layout.positions[m.r2];
        if (a < 0 || b < 0 || b < start || a >= end || a < layout.frozenCount)
          continue;
        if (a < start) {
          start = a;
          changed = true;
        }
        if (b >= end) {
          end = b + 1;
          changed = true;
        }
      }
    }
  }
  return {
    indexes: [
      ...layout.rows.slice(0, layout.frozenCount),
      ...layout.rows.slice(start, end),
    ],
    top: layout.offsets[start] - layout.offsets[layout.frozenCount],
    bottom: layout.offsets[layout.rows.length] - layout.offsets[end],
  };
}

// Preserve the text's original alignment anchor while clipping the overflow
// at occupied neighbors. Coordinates and pointer targets remain physical cells.
export function textOverflow(sheet, r, c, text, style, value) {
  if (wrapMode(style) !== "overflow" || style.rotation || typeof value !== "string" || !text || mergeAt(sheet, r, c)) return null;
  const base = sheet.widths[c] || 100,
    measured = Math.ceil(Math.max(...String(text).split("\n").map((line) => textWidth(line, style)))) ,
    extra = measured + 8 - (base - 1), align = style.align || "left";
  if (extra <= 0 || align === "justify") return null;
  const blocked = (column) => {
    const cell = sheet.cells[`${r},${column}`];
    return (cell?.value !== undefined && cell.value !== "") || mergeAt(sheet, r, column) || validationAt(sheet, r, column) ||
      (sheet.filter && r === sheet.filter.range.r && column >= sheet.filter.range.c && column <= sheet.filter.range.c2);
  };
  const take = (direction, need) => {
    let available = 0;
    for (let column = c + direction; column >= 0 && column < sheet.cols && available < need; column += direction) {
      if ((c < (sheet.frozenCols || 0)) !== (column < (sheet.frozenCols || 0))) break;
      if (blocked(column)) break;
      available += sheet.widths[column] || 100;
    }
    return Math.min(available, need);
  };
  const left = align === "right" ? take(-1, extra) : align === "center" ? take(-1, extra / 2) : 0,
    right = align === "center" ? take(1, extra / 2) : align === "right" ? 0 : take(1, extra);
  if (!left && !right) return null;
  return {
    width: base - 1 + left + right, offset: left ? -left : 0, textWidth: measured,
    textOffset: align === "right" ? left - extra : align === "center" ? left - extra / 2 : 0,
  };
}
