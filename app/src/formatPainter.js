import { validRange, contains } from "../shared/ranges.js";
import { BORDER_SIDES, captureCellStyle } from "../shared/borders.js";

function checkRange(range) {
  if (
    !validRange(range) ||
    (range.r2 - range.r + 1) * (range.c2 - range.c + 1) > 20000
  )
    throw new Error("Выберите диапазон не более 20 000 ячеек");
}
export function captureFormats(sheet, range) {
  checkRange(range);
  const height = range.r2 - range.r + 1,
    width = range.c2 - range.c + 1;
  return {
    sheetId: sheet.id,
    height,
    width,
    styles: Array.from({ length: height }, (_, r) =>
      Array.from({ length: width }, (_, c) =>
        captureCellStyle(sheet, range.r + r, range.c + c),
      ),
    ),
  };
}
export function paintFormats(sheet, source, range) {
  const target = { ...range };
  if (target.r === target.r2 && target.c === target.c2) {
    target.r2 += source.height - 1;
    target.c2 += source.width - 1;
  }
  checkRange(target);
  const changes = [];
  for (let r = target.r; r <= target.r2; r++)
    for (let c = target.c; c <= target.c2; c++) {
      const sourceStyle = structuredClone(source.styles[(r - target.r) % source.height][(c - target.c) % source.width]);
      if (
        sheet.merges?.some((m) => contains(m, r, c) && (m.r !== r || m.c !== c))
      )
      {
        if (sourceStyle.border || sourceStyle.borders || sheet.cells[`${r},${c}`]?.style?.borders)
          changes.push({ key: `${r},${c}`, cell: { style: { borders: Object.fromEntries(BORDER_SIDES.map((side) => [side, Object.hasOwn(sourceStyle.borders || {}, side) ? sourceStyle.borders[side] : sourceStyle.border ? { line: "thin", color: "#5f6368" } : null])) } } });
        continue;
      }
      changes.push({
        key: `${r},${c}`,
        cell: {
          style: sourceStyle,
        },
        replaceStyle: true,
      });
    }
  return changes;
}
