import { intersects } from "../shared/ranges.js";

// A private view projects coordinates; it never rearranges the shared document.
export function temporaryViewSignature(sheet) {
  return JSON.stringify([sheet.id, sheet.rows, sheet.cols, sheet.merges || []]);
}

export function createTemporaryView(sheet, range) {
  if ((sheet.merges || []).some((m) => intersects(m, range) &&
      (m.r !== m.r2 || m.c < range.c || m.c2 > range.c2)))
    throw new Error("В диапазоне есть объединённые ячейки. Выберите диапазон без объединений по вертикали и на его границах.");
  return {
    sheetId: sheet.id,
    signature: temporaryViewSignature(sheet),
    filter: structuredClone(sheet.filter || { range, criteria: {} }),
    sort: null,
  };
}

// Project validation/conditional-format ranges with the cells, including ranges
// crossing the view boundary. Adjacent rows coalesce back into rectangles.
function projectRange(range, filterRange, inverse) {
  const result = [];
  const left = Math.max(range.c, filterRange.c),
    right = Math.min(range.c2, filterRange.c2);
  if (left > right) return [range];
  if (range.c < left) result.push({ ...range, c2: left - 1 });
  if (right < range.c2) result.push({ ...range, c: right + 1 });
  const rows = [];
  for (let r = range.r; r <= range.r2; r++) rows.push(inverse.get(r) ?? r);
  rows.sort((a, b) => a - b);
  for (const r of rows) {
    const previous = result.at(-1);
    if (previous?.c === left && previous.c2 === right && previous.r2 === r - 1)
      previous.r2 = r;
    else result.push({ r, r2: r, c: left, c2: right });
  }
  return result;
}

export function projectTemporaryView(sheet, view, getValue) {
  if (!sheet || !view || view.sheetId !== sheet.id ||
      view.signature !== temporaryViewSignature(sheet)) return null;
  const { range } = view.filter,
    sourceRows = Array.from({ length: range.r2 - range.r }, (_, i) => range.r + i + 1);
  if (view.sort) {
    const { col, desc } = view.sort;
    sourceRows.sort((a, b) => {
      const av = getValue(a, col), bv = getValue(b, col);
      const aBlank = av === "" || av == null, bBlank = bv === "" || bv == null;
      if (aBlank || bBlank) return Number(aBlank) - Number(bBlank) || a - b;
      const compared = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "ru", { numeric: true });
      return compared * (desc ? -1 : 1) || a - b;
    });
  }
  const forward = new Map(sourceRows.map((source, i) => [range.r + i + 1, source])),
    inverse = new Map(sourceRows.map((source, i) => [source, range.r + i + 1]));
  const inColumns = (c) => c >= range.c && c <= range.c2,
    sourceAt = (r, c) => ({ r: inColumns(c) ? forward.get(r) ?? r : r, c }),
    viewAt = (r, c) => ({ r: inColumns(c) ? inverse.get(r) ?? r : r, c });
  const cells = {};
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const [r, c] = key.split(",").map(Number), target = viewAt(r, c);
    cells[`${target.r},${target.c}`] = cell;
  }
  const rules = (items) => (items || []).flatMap((item) =>
    projectRange(item.range, range, inverse).map((range) => ({ ...item, range })),
  );
  return {
    sourceAt, viewAt,
    sheet: {
      ...sheet, cells, filter: view.filter,
      merges: (sheet.merges || []).map((m) => {
        const target = viewAt(m.r, m.c);
        return { ...m, r: target.r, r2: target.r + m.r2 - m.r };
      }),
      validations: rules(sheet.validations),
    },
  };
}
