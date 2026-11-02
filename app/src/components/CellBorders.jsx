import { borderAt, borderCss, BORDER_LINES } from "../../shared/borders.js";
import { mergeAt } from "../gridModel.js";
export default function CellBorders({ sheet, r, c, layout }) {
  const range = mergeAt(sheet, r, c) || { r, r2: r, c, c2: c }, segments = [];
  const width = Array.from({ length: range.c2 - c + 1 }, (_, i) => sheet.widths[c + i] || 100).reduce((a, b) => a + b, 0),
    height = Array.from({ length: range.r2 - r + 1 }, (_, i) => layout.heights[r + i]).reduce((a, b) => a + b, 0);
  let x = 0;
  for (let col = c; col <= range.c2; col++) {
    for (const [side, row] of [["top", r], ["bottom", range.r2]]) {
      const edge = borderAt(sheet, row, col, side);
      if (edge) segments.push(<span key={`${side}:${col}`} data-border={side} style={{ left: x - 1, top: (side === "top" ? 0 : height) - (BORDER_LINES[edge.line][0] + 1) / 2, width: (sheet.widths[col] || 100) + 1, borderTop: borderCss(edge) }} />);
    }
    x += sheet.widths[col] || 100;
  }
  let y = 0;
  for (let row = r; row <= range.r2; row++) {
    for (const [side, col] of [["left", c], ["right", range.c2]]) {
      const edge = borderAt(sheet, row, col, side);
      if (edge) segments.push(<span key={`${side}:${row}`} data-border={side} style={{ top: y - 1, left: (side === "left" ? 0 : width) - (BORDER_LINES[edge.line][0] + 1) / 2, height: layout.heights[row] + 1, borderLeft: borderCss(edge) }} />);
    }
    y += layout.heights[row];
  }
  return segments.length ? <span className="cell-borders" aria-hidden="true">{segments}</span> : null;
}
