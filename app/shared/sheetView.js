export function freezePatch(sheet, input) {
  if (!sheet || input.rows === undefined && input.cols === undefined) throw new Error("Неверное закрепление");
  if (input.rows !== undefined && !Number.isInteger(input.rows) || input.cols !== undefined && !Number.isInteger(input.cols)) throw new Error("Неверное закрепление");
  const rows = input.rows ?? sheet.frozen ?? 0, cols = input.cols ?? sheet.frozenCols ?? 0;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 0 || rows > sheet.rows || cols < 0 || cols > sheet.cols) throw new Error("Неверное закрепление");
  if ((sheet.merges || []).some(m => m.r < rows && m.r2 >= rows || m.c < cols && m.c2 >= cols)) throw new Error("Закрепление пересекает объединённые ячейки");
  return { frozen: rows, frozenCols: cols };
}
export function shiftFrozen(sheet, axis, index, count, remove) {
  const key = axis === "row" ? "frozen" : "frozenCols", current = sheet[key] || 0;
  if (index < current) sheet[key] = remove ? current - Math.min(count, current - index) : current + count;
}
export function frozenColumnLeft(sheet, col) {
  let left = 46;
  for (let c = 0; c < col; c++) left += sheet.widths[c] || 100;
  return left;
}
