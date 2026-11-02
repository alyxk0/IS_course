import { test } from "node:test";
import assert from "node:assert/strict";
import { exportWorkbook, importXLSX } from "../src/files.js";
import { parseCSV } from "../src/api.js";
import { formulaEngine } from "../server/formulas.js";
test("XLSX round trip preserves values, formulas and formatting", async () => {
  const doc = {
    state: {
      sheets: [
        {
          name: "Лист1",
          widths: { 0: 150 },
          frozen: 1,
          cells: {
            "0,0": {
              value: "12",
              style: { bold: true, background: "#d3e3fd" },
            },
            "1,0": { value: "=A1*2", style: { italic: true } },
            "0,1": { value: "Привет" },
          },
        },
      ],
    },
  };
  const buffer = await exportWorkbook(doc, () => 24),
    { cells: changes } = await importXLSX(buffer);
  assert.equal(changes.find((c) => c.r === 0 && c.c === 0).cell.value, "12");
  assert.equal(
    changes.find((c) => c.r === 0 && c.c === 0).cell.style.bold,
    true,
  );
  assert.equal(
    changes.find((c) => c.r === 0 && c.c === 0).cell.style.background,
    "#d3e3fd",
  );
  assert.equal(changes.find((c) => c.r === 1 && c.c === 0).cell.value, "=A1*2");
  assert.equal(
    changes.find((c) => c.r === 0 && c.c === 1).cell.value,
    "Привет",
  );
});
test("CSV parser handles escaped quotes, multiline fields, tabs and CRLF", () => {
  assert.deepEqual(parseCSV('"a,b","say ""yes"""\r\n"two\nlines",x'), [
    ["a,b", 'say "yes"'],
    ["two\nlines", "x"],
  ]);
  assert.deepEqual(parseCSV("one\ttwo\n3\t4\n"), [
    ["one", "two"],
    ["3", "4"],
  ]);
});
test("Excel export and import preserve merged anchors without duplicating covered values", async () => {
  const doc = {
    state: {
      sheets: [
        {
          name: "Merged",
          rows: 1000,
          cols: 26,
          widths: {},
          cells: { "0,0": { value: "Merged heading", style: { bold: true } } },
          merges: [{ r: 0, c: 0, r2: 1, c2: 2 }],
        },
      ],
    },
  };
  const buffer = await exportWorkbook(doc, () => "Merged heading"),
    result = await importXLSX(buffer);
  assert.deepEqual(result.merges, [{ r: 0, c: 0, r2: 1, c2: 2 }]);
  assert.equal(result.cells.length, 1);
  assert.equal(result.cells[0].cell.value, "Merged heading");
});
test("XLSX contains native validation, long named lists, booleans, dates and conditional rules", async () => {
  const doc = {
    state: {
      sheets: [
        {
          name: "Data",
          rows: 1000,
          cols: 26,
          widths: {},
          cells: {
            "0,0": { value: "Статус" },
            "1,0": { value: "Длинный вариант, с запятой" },
            "1,1": { value: "20" },
            "1,2": { value: "TRUE" },
            "1,3": { value: "2026-10-19" },
          },
          conditionalFormats: [
            {
              range: { r: 1, c: 1, r2: 3, c2: 1 },
              condition: { type: "gt", value: 10 },
              style: { background: "#ff0000", bold: true },
            },
            {
              range: { r: 1, c: 4, r2: 3, c2: 4 },
              condition: { type: "colorScale" },
              colors: ["#ff0000", "#ffff00", "#00ff00"],
            },
          ],
          validations: [
            {
              range: { r: 1, c: 0, r2: 3, c2: 0 },
              type: "list",
              values: [
                "Длинный вариант, с запятой",
                'Вариант с "кавычками"',
                "x".repeat(200),
              ],
              reject: true,
            },
            {
              range: { r: 1, c: 1, r2: 3, c2: 1 },
              type: "number",
              operator: "between",
              value: 1,
              value2: 30,
              reject: false,
            },
            {
              range: { r: 1, c: 2, r2: 3, c2: 2 },
              type: "checkbox",
              reject: true,
            },
            { range: { r: 1, c: 3, r2: 3, c2: 3 }, type: "date", reject: true },
          ],
        },
      ],
    },
  };
  const engine = formulaEngine(doc.state);
  try {
    const buffer = await exportWorkbook(doc, (sheet, r, c) =>
      engine.getCellValue({
        sheet: engine.getSheetId(sheet.name),
        row: r,
        col: c,
      }),
    );
    const { default: ExcelJS } = await import("exceljs"),
      book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    const sheet = book.getWorksheet("Data");
    assert.equal(sheet.getCell("A2").dataValidation.type, "list");
    assert.equal(
      sheet.getCell("A2").dataValidation.formulae[0],
      "_OpenSheetsList1",
    );
    assert.equal(book.getWorksheet("_OpenSheetsLists").state, "veryHidden");
    assert.equal(
      book.getWorksheet("_OpenSheetsLists").getCell("A3").value,
      "x".repeat(200),
    );
    assert.equal(sheet.getCell("B2").dataValidation.errorStyle, "warning");
    assert.equal(sheet.getCell("C2").value, true);
    assert.equal(
      sheet.getCell("D2").value.toISOString().slice(0, 10),
      "2026-10-19",
    );
    assert.equal(sheet.conditionalFormattings[0].rules[0].type, "expression");
    assert.match(sheet.conditionalFormattings[0].rules[0].formulae[0], /B2>10/);
    assert.equal(
      sheet.conditionalFormattings[0].rules[0].style.fill.fgColor.argb.toUpperCase(),
      "FFFF0000",
    );
    assert.equal(sheet.conditionalFormattings[1].rules[0].type, "colorScale");
  } finally {
    engine.destroy();
  }
});
