import { HyperFormula } from "hyperformula";
import { validRange, usedRange, intersects } from "../shared/ranges.js";
import { formulaInput } from "../shared/cellInput.js";
import { toEngineFormula, fromEngineFormula } from "../shared/namedRanges.js";

export function sortingRange(sheet, selection, wholeSheet = false) {
  if (!wholeSheet) return { ...selection };
  const used = usedRange(sheet);
  for (const key of Object.keys(sheet.cells)) {
    const [r, c] = key.split(",").map(Number);
    used.r2 = Math.max(used.r2, r); used.c2 = Math.max(used.c2, c);
  }
  return { ...used, c2: Math.max(used.c2, selection.c) };
}
function checkRange(sheet, range) {
  if (!validRange(range, sheet.rows, sheet.cols)) throw new Error("Неверный диапазон");
  if ((range.r2 - range.r + 1) * (range.c2 - range.c + 1) > 20000)
    throw new Error("За один раз можно изменить не более 20 000 ячеек");
}
function compare(a, b, desc) {
  const emptyA = a === "" || a == null, emptyB = b === "" || b == null;
  if (emptyA || emptyB) return Number(emptyA) - Number(emptyB);
  const type = (v) => typeof v === "number" ? 0 : typeof v === "boolean" ? 2 : 1;
  const result = type(a) - type(b) || (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "ru", { numeric: true, sensitivity: "base" }));
  return result * (desc ? -1 : 1);
}
export function sortChanges(sheet, range, rules, header, getValue, sheets = [sheet], namedRanges = []) {
  checkRange(sheet, range);
  if (!Array.isArray(rules) || !rules.length || rules.some((r) => !Number.isInteger(r.col) || r.col < range.c || r.col > range.c2 || typeof r.desc !== "boolean") || new Set(rules.map(r => r.col)).size !== rules.length)
    throw new Error("Выберите разные столбцы для сортировки");
  if ((sheet.merges || []).some(m => intersects(m, range)))
    throw new Error("Перед сортировкой отмените объединения ячеек в диапазоне");
  const first = range.r + (header ? 1 : 0), rows = Array.from({ length: Math.max(0, range.r2 - first + 1) }, (_, i) => first + i);
  rows.sort((a, b) => {
    for (const rule of rules) { const result = compare(getValue(a, rule.col), getValue(b, rule.col), rule.desc); if (result) return result; }
    return a - b;
  });
  const engine = HyperFormula.buildEmpty({ licenseKey: "gpl-v3", useArrayArithmetic: false });
  try {
    for (const name of new Set([...sheets.map(s => s.name), sheet.name])) engine.addSheet(name);
    const id = engine.getSheetId(sheet.name), raw = Array.from({ length: range.r2 - range.r + 1 }, (_, i) => Array.from({ length: range.c2 - range.c + 1 }, (_, j) => toEngineFormula(formulaInput(sheet.cells[`${range.r + i},${range.c + j}`] || { value: "" }),namedRanges,sheets,sheet.id)));
    engine.setCellContents({ sheet: id, row: range.r, col: range.c }, raw);
    const changes = [];
    for (let row = range.r; row <= range.r2; row++) {
      const oldRow = row < first ? row : rows[row - first];
      const data = oldRow === row ? null : engine.getFillRangeData({ start: { sheet: id, row: oldRow, col: range.c }, end: { sheet: id, row: oldRow, col: range.c2 } }, { start: { sheet: id, row, col: range.c }, end: { sheet: id, row, col: range.c2 } }, true)[0];
      for (let col = range.c; col <= range.c2; col++) {
        const key = `${row},${col}`, cell = sheet.cells[`${oldRow},${col}`];
        const next = cell ? structuredClone(cell) : null;
        if (next?.value?.startsWith("=") && !next.literal && data) next.value = String(fromEngineFormula(data[col - range.c] ?? "", namedRanges,sheets));
        changes.push({ key, cell: next, replace: true, expected: structuredClone(sheet.cells[key] || {}) });
      }
    }
    return changes;
  } finally { engine.destroy(); }
}
export function trimChanges(sheet, range) {
  checkRange(sheet, range);
  const changes = [];
  for (let r = range.r; r <= range.r2; r++) for (let c = range.c; c <= range.c2; c++) {
    const key = `${r},${c}`, cell = sheet.cells[key];
    // Sheets' trim operation leaves formulas, numbers and nonbreaking spaces intact.
    if (!cell || typeof cell.value !== "string" || (cell.value.startsWith("=") && !cell.literal)) continue;
    const value = cell.value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "").replace(/[ \t\r\n]+/g, " ");
    if (value !== cell.value) changes.push({ key, cell: { ...cell, value, ...(value.startsWith("=") || value.startsWith("+") ? { literal: true } : {}) }, replace: true, expected: structuredClone(cell) });
  }
  return changes;
}
