import { HyperFormula } from "hyperformula";
import { formulaInput } from "../shared/cellInput.js";
import { validRange, intersects } from "../shared/ranges.js";
import { captureCellStyle } from "../shared/borders.js";
import { toEngineFormula, fromEngineFormula } from "../shared/namedRanges.js";
export const CLIPBOARD_TYPE = "application/x-open-sheets+json";
export function captureClipboard(sheet, range, cut = false) {
  const rows = range.r2 - range.r + 1,
    cols = range.c2 - range.c + 1;
  if (rows * cols > 20000)
    throw new Error("За один раз можно копировать не более 20 000 ячеек");
  return {
    version: 1,
    sheetName: sheet.name,
    range,
    cut,
    cells: Array.from({ length: rows }, (_, r) =>
      Array.from(
        { length: cols },
        (_, c) => {
          const cell = sheet.cells[`${range.r + r},${range.c + c}`] || { value: "" }, style = captureCellStyle(sheet, range.r + r, range.c + c);
          return Object.keys(style).length || cell.style ? { ...cell, style } : cell;
        },
      ),
    ),
    merges: (sheet.merges || []).filter((m) => intersects(m, range)),
  };
}
export function relocateClipboard(payload, sheet, origin, sheets, namedRanges = []) {
  if (
    payload?.version !== 1 ||
    typeof payload.sheetName !== "string" ||
    payload.sheetName.length > 60 ||
    !validRange(payload.range) ||
    !Array.isArray(payload.cells) ||
    !Array.isArray(payload.merges)
  )
    throw new Error("Некорректные данные буфера обмена");
  const height = payload.range.r2 - payload.range.r + 1,
    width = payload.range.c2 - payload.range.c + 1;
  if (
    height * width > 20000 ||
    payload.cells.length !== height ||
    payload.cells.some((row) => !Array.isArray(row) || row.length !== width)
  )
    throw new Error("Некорректный диапазон буфера обмена");
  if (origin.r + height > 10000 || origin.c + width > 200)
    throw new Error("Вставка выходит за пределы листа");
  const engine = HyperFormula.buildEmpty({
    licenseKey: "gpl-v3",
    maxRows: 10000,
    maxColumns: 200,
  });
  try {
    for (const name of new Set([
      ...sheets.map((s) => s.name),
      payload.sheetName,
      sheet.name,
    ]))
      engine.addSheet(name);
    const from = engine.getSheetId(payload.sheetName),
      to = engine.getSheetId(sheet.name);
    const raw = payload.cells.map((row) =>
      row.map((cell) => (typeof cell?.value === "string" ? toEngineFormula(formulaInput(cell),namedRanges,sheets,sheets.find(s=>s.name===payload.sheetName)?.id) : "")),
    );
    engine.setCellContents(
      { sheet: from, row: payload.range.r, col: payload.range.c },
      raw,
    );
    const data = payload.cut
      ? raw
      : engine.getFillRangeData(
          {
            start: { sheet: from, row: payload.range.r, col: payload.range.c },
            end: { sheet: from, row: payload.range.r2, col: payload.range.c2 },
          },
          {
            start: { sheet: to, row: origin.r, col: origin.c },
            end: {
              sheet: to,
              row: origin.r + height - 1,
              col: origin.c + width - 1,
            },
          },
          true,
        );
    const changes = [];
    data.forEach((row, r) =>
      row.forEach((value, c) =>
        changes.push({
          key: `${origin.r + r},${origin.c + c}`,
          cell: {
            ...payload.cells[r][c],
            literal: !!payload.cells[r][c]?.literal,
            value: payload.cells[r][c]?.literal ? payload.cells[r][c].value : value == null ? "" : String(fromEngineFormula(value, namedRanges,sheets)),
          },
          replace: true,
        }),
      ),
    );
    const dr = origin.r - payload.range.r,
      dc = origin.c - payload.range.c;
    const merges = payload.merges.map((m) => {
      if (
        !validRange(m) ||
        m.r < payload.range.r ||
        m.r2 > payload.range.r2 ||
        m.c < payload.range.c ||
        m.c2 > payload.range.c2
      )
        throw new Error("Некорректное объединение в буфере");
      return { r: m.r + dr, r2: m.r2 + dr, c: m.c + dc, c2: m.c2 + dc };
    });
    return {
      changes: changes.flatMap(
        (change) => {
          const covered = merges.some((m) => {
            const [r, c] = change.key.split(",").map(Number);
            return (
              r >= m.r &&
              r <= m.r2 &&
              c >= m.c &&
              c <= m.c2 &&
              (r !== m.r || c !== m.c)
            );
          });
          if (!covered) return [change];
          return change.cell.style?.borders ? [{ key: change.key, cell: { style: { borders: change.cell.style.borders } } }] : [];
        },
      ),
      merges,
    };
  } finally {
    engine.destroy();
  }
}
