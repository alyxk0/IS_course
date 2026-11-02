import { buildLayout } from "./gridModel.js";
import { formatValue } from "./format.js";
import {
  excelNumberFormat,
  readNumberFormat,
} from "../shared/numberFormats.js";
import { parseAddress } from "./api.js";
import { addXLSXFeatures } from "./xlsxFeatures.js";
import { validationAt, validationMatches } from "../shared/rules.js";
import { addWorkbookLinks, extractWorkbookLinks } from "./xlsxLinks.js";
import { formulaInput } from "../shared/cellInput.js";
import { wrapMode } from "../shared/textWrapping.js";
import { BORDER_SIDES, BORDER_LINES, borderAt } from "../shared/borders.js";
import { parseNamedTarget } from "./namedRangeModel.js";
import { validRangeName } from "../shared/namedRanges.js";
export async function exportWorkbook(doc, getValue) {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "Таблицы";
  book.created = new Date();
  const featureContext = { reservedNames: new Set((doc.state.namedRanges || []).map(item => item.name.toLowerCase())) };
  const linkSheets = [];
  for (const sheet of doc.state.sheets) {
    const ws = book.addWorksheet(sheet.name, { state: sheet.hidden ? "hidden" : "visible" });
    if (sheet.tabColor) ws.properties.tabColor = { argb: "FF" + sheet.tabColor.slice(1) };
    linkSheets.push({ id: ws.id, sheetId:sheet.id, workbookIndex:book.worksheets.indexOf(ws), cells: sheet.cells, bandedRanges: sheet.bandedRanges });
    ws.properties.defaultRowHeight = 15.75;
    for (const [col, width] of Object.entries(sheet.widths))
      ws.getColumn(+col + 1).width = width / 7;
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const [r, c] = key.split(",").map(Number),
        target = ws.getCell(r + 1, c + 1),
        s = cell.style || {};
      if (!cell.literal && cell.value?.startsWith("="))
        target.value = {
          formula: cell.value.slice(1),
          result: getValue(sheet, r, c),
        };
      else if (cell.value !== undefined) {
        const input = formulaInput(cell);
        target.value =
          typeof input === "number" ? input : !cell.literal && cell.value !== "" && Number.isFinite(Number(cell.value))
            ? Number(cell.value)
            : cell.value;
      }
      const validation = validationAt(sheet, r, c);
      if (
        validation?.type === "checkbox" &&
        ["TRUE", "FALSE"].includes(String(cell.value).toUpperCase())
      )
        target.value = String(cell.value).toUpperCase() === "TRUE";
      if (
        validation?.type === "date" &&
        /^\d{4}-\d{2}-\d{2}$/.test(cell.value) &&
        validationMatches(validation, cell.value)
      ) {
        target.value = new Date(cell.value + "T00:00:00Z");
        target.numFmt = "yyyy-mm-dd";
      }
      if (validation?.type === "date") target.numFmt = "yyyy-mm-dd";
      target.font = {
        name: s.fontFamily || "Arial",
        size: s.fontSize || 10,
        bold: s.bold || false,
        italic: s.italic || false,
        strike: s.strike || false,
        color: {
          argb:
            "FF" + (s.color || (cell.link ? "#1155cc" : "#202124")).slice(1),
        },
        underline: s.underline ?? !!cell.link,
      };
      if (s.background)
        target.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF" + s.background.slice(1) },
        };
      target.alignment = {
        horizontal: s.align || "general",
        vertical: s.verticalAlign || "bottom",
        textRotation: s.rotation || 0,
        wrapText: wrapMode(s) === "wrap",
      };
      const numberFormat = excelNumberFormat(s);
      if (numberFormat) target.numFmt = numberFormat;
    }
    for (const merge of sheet.merges || [])
      ws.mergeCellsWithoutStyle(merge.r + 1, merge.c + 1, merge.r2 + 1, merge.c2 + 1);
    const borderCells = new Set(Object.keys(sheet.cells));
    for (const m of sheet.merges || []) {
      for (let r = m.r; r <= m.r2; r++) { borderCells.add(`${r},${m.c}`); borderCells.add(`${r},${m.c2}`); }
      for (let c = m.c; c <= m.c2; c++) { borderCells.add(`${m.r},${c}`); borderCells.add(`${m.r2},${c}`); }
    }
    for (const key of borderCells) {
      const [r, c] = key.split(",").map(Number), edges = {};
      for (const side of BORDER_SIDES) {
        const edge = borderAt(sheet, r, c, side);
        if (edge) edges[side] = { style: edge.line, color: { argb: "FF" + edge.color.slice(1) } };
      }
      if (Object.keys(edges).length) ws.getCell(r + 1, c + 1).border = edges;
    }
    const layout = buildLayout(sheet, (r, c) =>
      formatValue(getValue(sheet, r, c), sheet.cells[`${r},${c}`]?.style),
    );
    for (let r = 0; r <= layout.used.r2; r++) {
      if (layout.heights[r] !== 21)
        ws.getRow(r + 1).height = layout.heights[r] * 0.75;
      if (layout.positions[r] === -1) ws.getRow(r + 1).hidden = true;
    }
    if (sheet.filter) {
      const f = sheet.filter.range;
      ws.autoFilter = {
        from: { row: f.r + 1, column: f.c + 1 },
        to: { row: f.r2 + 1, column: f.c2 + 1 },
      };
    }
    ws.views = [{ state: sheet.frozen || sheet.frozenCols ? "frozen" : "normal", xSplit: sheet.frozenCols || 0, ySplit: sheet.frozen || 0, showGridLines: !sheet.hideGridlines }];
    addXLSXFeatures(book, ws, sheet, featureContext);
  }
  return addWorkbookLinks(await book.xlsx.writeBuffer(), linkSheets, doc.state.namedRanges || [], doc.state.sheets);
}
export async function importXLSX(buffer) {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  const extracted = await extractWorkbookLinks(buffer);
  await book.xlsx.load(extracted.buffer);
  const ws = book.worksheets[0];
  if (!ws) throw new Error("Файл не содержит листов");
  if (ws.rowCount > 10000 || ws.columnCount > 200)
    throw new Error("Лимит импорта: 10 000 строк и 200 столбцов");
  const changes = [];
  const importCell = (cell, r, c) => {
      const borders = {};
      for (const side of BORDER_SIDES) {
        const edge = cell.border?.[side];
        if (edge?.style && Object.hasOwn(BORDER_LINES, edge.style)) borders[side] = { line: edge.style, color: "#" + (edge.color?.argb?.slice(-6) || "000000") };
      }
      if (cell.isMerged && cell.master.address !== cell.address) {
        if (Object.keys(borders).length) changes.push({ r: r - 1, c: c - 1, cell: { value: "", style: { borders } } });
        return;
      }
      const v = cell.value;
      let value = "";
      if ((v === null || v === undefined) && !Object.keys(cell.style || {}).length) return;
      if (v !== null && typeof v === "object") {
        if (v.formula) value = "=" + v.formula;
        else if (v.sharedFormula) value = "=" + cell.formula;
        else if (v.richText) value = v.richText.map((t) => t.text).join("");
        else if (v instanceof Date)
          value = cell.dataValidation?.type === "date" ? v.toISOString().slice(0, 10)
            : String((v.getTime() - Date.UTC(1899, 11, 30)) / 86400000);
        else if (v.text) value = v.text;
        else value = String(cell.text || "");
      } else value = String(v ?? "");
      const style = {};
      if (Object.keys(borders).length) style.borders = borders;
      if (cell.font) {
        style.bold = !!cell.font.bold;
        style.italic = !!cell.font.italic;
        style.strike = !!cell.font.strike;
        if (cell.font.underline !== undefined) style.underline = !!cell.font.underline;
        if (cell.font.size) style.fontSize = cell.font.size;
        if (cell.font.name) style.fontFamily = cell.font.name;
        if (cell.font.color?.argb)
          style.color = "#" + cell.font.color.argb.slice(-6);
      }
      if (cell.fill?.fgColor?.argb)
        style.background = "#" + cell.fill.fgColor.argb.slice(-6);
      if (
        ["left", "center", "right", "justify"].includes(
          cell.alignment?.horizontal,
        )
      )
        style.align = cell.alignment.horizontal;
      if (cell.alignment?.wrapText) style.wrap = true;
      if (extracted.clipped.has(`${r - 1},${c - 1}`)) Object.assign(style, { wrap: false, wrapMode: "clip" });
      if (["top", "middle", "bottom"].includes(cell.alignment?.vertical))
        style.verticalAlign = cell.alignment.vertical;
      if (cell.alignment?.textRotation !== undefined)
        style.rotation = cell.alignment.textRotation;
      const numberFormat = readNumberFormat(cell.numFmt);
      if (numberFormat) Object.assign(style, numberFormat);
      else if (cell.numFmt?.includes("%")) style.format = "percent";
      const link = extracted.links.get(`${r - 1},${c - 1}`);
      if (link) style.underline = !!cell.font?.underline;
      changes.push({
        r: r - 1,
        c: c - 1,
        cell: { value, style, literal: !!(typeof v === "string" || v?.richText), ...(link ? { link } : {}) },
      });
  };
  // The public model includes style-only cells; eachRow/eachCell otherwise
  // skips empty cells with borders and can lose a blank formatted range.
  for (const row of ws.model.rows || []) for (const entry of row.cells || []) {
    const cell = ws.getCell(entry.address);
    importCell(cell, cell.row, cell.col);
  }
  const presentCells = new Set(changes.map((cell) => `${cell.r},${cell.c}`));
  for (const [key, link] of extracted.links) {
    const [r, c] = key.split(",").map(Number);
    if (!presentCells.has(key)) {
      changes.push({ r, c, cell: { value: "", link, ...(extracted.clipped.has(key) ? { style: { wrap: false, wrapMode: "clip" } } : {}) } });
      presentCells.add(key);
    }
  }
  for (const key of extracted.clipped) {
    if (presentCells.has(key)) continue;
    const [r, c] = key.split(",").map(Number);
    changes.push({ r, c, cell: { value: "", style: { wrap: false, wrapMode: "clip" } } });
    presentCells.add(key);
  }
  if (changes.length > 20000)
    throw new Error(
      "За один раз можно импортировать не более 20 000 заполненных ячеек",
    );
  const merges = (ws.model.merges || []).map((value) => {
    const [start, end] = value.split(":").map(parseAddress);
    return {
      r: start.row,
      c: start.col,
      r2: end?.row ?? start.row,
      c2: end?.col ?? start.col,
    };
  });
  const namedRanges = [];
  for (const item of extracted.namedRanges || []) {
    if (!validRangeName(item.name)) continue;
    try { const parsed = parseNamedTarget(item.address, [{ id: "import", name: ws.name, rows: 10000, cols: 200 }], "import"); namedRanges.push({ name: item.name, ...parsed }); } catch { /* Only finite ranges on the imported first sheet are supported. */ }
  }
  return { cells: changes, merges, bandedRanges: extracted.bandedRanges, namedRanges };
}
