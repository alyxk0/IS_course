import { parseRange } from "./api.js";
export function parseNamedTarget(text, sheets, currentId) {
  const input = String(text).trim(), at = input.lastIndexOf("!");
  let sheet = sheets.find(s => s.id === currentId), address = input;
  if (at >= 0) { const name = input.slice(0, at).replace(/^'|'$/g, "").replaceAll("''", "'"); sheet = sheets.find(s => s.name === name); address = input.slice(at + 1); }
  if (!sheet) throw new Error("Лист не найден");
  return { sheetId: sheet.id, range: parseRange(address, sheet), ...(/^[\$a-z]+:[\$a-z]+$/i.test(address) ? { allRows: true } : /^\$?\d+:\$?\d+$/.test(address) ? { allCols: true } : {}) };
}
