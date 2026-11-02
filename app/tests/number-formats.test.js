import { test } from "node:test";
import assert from "node:assert/strict";
import { formatValue } from "../src/format.js";
import { formatPattern, withNumberPrecision, validNumberPattern, numberFormatColor } from "../shared/numberFormats.js";
import { formulaEngine } from "../server/formulas.js";
import { createStore } from "../server/store.js";
import { captureClipboard, relocateClipboard } from "../src/clipboard.js";
import { exportWorkbook, importXLSX } from "../src/files.js";

test("date, time and duration use Sheets epoch and preserve fractions without local timezone drift", () => {
  assert.equal(formatValue(0, { format: "date" }), "30.12.1899");
  assert.equal(formatValue(2, { format: "date" }), "01.01.1900");
  assert.equal(formatValue(60, { format: "date" }), "28.02.1900");
  assert.equal(formatValue(61, { format: "date" }), "01.03.1900");
  assert.equal(formatValue(46314.5, { format: "datetime" }), "19.10.2026 12:00:00");
  assert.equal(formatValue(1.5, { format: "duration" }), "36:00:00");
  const state = { sheets: [{ name: "Sheet", cells: {
    "0,0": { value: "19.10.2026", style: { format: "date" } },
    "1,0": { value: "2026-10-19 12:00:00", style: { format: "datetime" } },
    "2,0": { value: "36:00:00", style: { format: "duration" } },
    "3,0": { value: "1900-02-29", style: { format: "date" } },
  } }] };
  const engine = formulaEngine(state);
  try { assert.deepEqual(engine.getAllSheetsValues().Sheet, [[46314], [46314.5], [1.5], ["1900-02-29"]]); }
  finally { engine.destroy(); }
});

test("custom format sections, conditions, fractions, colors and precision preserve quoted literals and exponents", () => {
  const style = { format: "custom", numberPattern: '0.00E+00" v.1";[Red](0.00E+00)" v.1";"zero";@' };
  assert.equal(formatValue(1200, style), "1,20E+03 v.1");
  const next = withNumberPrecision(style, 3);
  assert.equal(next.numberPattern, '0.000E+00" v.1";[Red](0.000E+00)" v.1";"zero";@');
  assert.equal(numberFormatColor(-12, style), "red");
  assert.equal(formatValue(0, style), "zero");
  assert.equal(formatValue("text", style), "text");
  assert.equal(formatValue(1.25, { format: "custom", numberPattern: "# ?/?" }).trim(), "1 1/4");
  assert.equal(formatValue(12.3, { format: "scientific" }), "1,23E+01");
  assert.equal(formatValue(-1200, { format: "financial" }).replaceAll("\u00a0", " "), "(1 200,00)");
  assert.equal(formatValue(1, { format: "number" }), "1,00");
  assert.equal(formatValue(.1, { format: "percent" }).replaceAll("\u00a0", " "), "10,00 %");
  for (const p of ["[", '0.00"', "0".repeat(201), "0\n0"]) assert.equal(validNumberPattern(p), false);
});

function fixture() {
  const store = createStore(":memory:"), user = { id: "owner", email: "formats@example.com", name: "Owner" };
  store.db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(user.id, user.email, user.name, "hash");
  const doc = store.createDoc(user), sheetId = doc.state.sheets[0].id;
  const cells = (changes) => store.apply(doc.id, user, { type: "cells", sheetId, changes });
  return { store, user, doc, sheetId, cells };
}

test("text input remains literal through calculations, clipboard, structural edits and format changes; invalid formats roll back", () => {
  const { store, user, doc, sheetId, cells } = fixture();
  try {
    cells([
      { key: "0,0", cell: { value: "00123", style: { format: "text" } } },
      { key: "1,0", cell: { value: "=A1", style: { format: "text" } } },
      { key: "2,0", cell: { value: "=1+2" } },
    ]);
    cells([{ key: "2,0", cell: { style: { format: "text" } } }]);
    let sheet = store.getDoc(doc.id).state.sheets[0];
    const engine = formulaEngine({ sheets: [sheet] });
    try { assert.deepEqual(engine.getAllSheetsValues()[sheet.name], [["00123"], ["=A1"], [3]]); }
    finally { engine.destroy(); }
    const clip = captureClipboard(sheet, { r: 0, c: 0, r2: 1, c2: 0 }),
      { changes } = relocateClipboard(clip, sheet, { r: 0, c: 1 }, [sheet]);
    cells(changes);
    sheet = store.getDoc(doc.id).state.sheets[0];
    assert.equal(sheet.cells["1,1"].value, "=A1");
    assert.equal(sheet.cells["1,1"].literal, true);
    const previous = structuredClone(sheet.cells["1,0"]);
    cells([{ key: "1,0", cell: { value: "00123", style: { format: "text" }, literal: true }, replace: true, expected: previous }]);
    cells([{ key: "1,0", cell: { value: "=A1", style: { format: "text" }, literal: true }, replace: true,
      expected: { style: { format: "text" }, literal: true, value: "00123" } }]);
    assert.equal(store.getDoc(doc.id).state.sheets[0].cells["1,0"].value, "=A1");
    store.apply(doc.id, user, { type: "structure", sheetId, axis: "row", action: "insert", index: 0, count: 1 });
    sheet = store.getDoc(doc.id).state.sheets[0];
    assert.equal(sheet.cells["2,0"].value, "=A1");
    assert.equal(sheet.cells["1,0"].value, "00123");
    const before = store.getDoc(doc.id);
    for (const invalid of [{ format: "custom" }, { format: "custom", numberPattern: "[" }, { currency: "12$" }, { format: "unknown" }]) {
      assert.throws(() => cells([{ key: "0,0", cell: { value: "FORBIDDEN", style: invalid } }]), /формат|маск|валют/);
      assert.deepEqual(store.getDoc(doc.id), before);
    }
  } finally { store.db.close(); }
});

test("Excel preserves literal strings, date-time fractions, duration, formulas and custom masks", async () => {
  const cells = {
    "0,0": { value: "00123", literal: true, style: { format: "text" } },
    "0,1": { value: "=A1", literal: true, style: { format: "text" } },
    "1,0": { value: "46314.5", style: { format: "datetime" } },
    "1,1": { value: "1.5", style: { format: "duration" } },
    "2,0": { value: "=1/4", style: { format: "custom", numberPattern: "# ?/?" } },
    "2,1": { value: "1200.125", style: { format: "currency", currency: "USD", decimalPlaces: 3 } },
    "3,0": { value: "19.10.2026", style: { format: "date" } },
  }, sheet = { name: "Formats", rows: 1000, cols: 26, widths: {}, cells },
    state = { sheets: [sheet] }, engine = formulaEngine(state);
  try {
    const data = await exportWorkbook({ state }, (s, r, c) => engine.getCellValue({ sheet: 0, row: r, col: c }));
    const imported = await importXLSX(data), at = (r, c) => imported.cells.find((v) => v.r === r && v.c === c).cell;
    assert.equal(at(0, 0).value, "00123");
    assert.equal(at(0, 1).value, "=A1");
    assert.equal(at(0, 1).literal, true);
    assert.equal(Number(at(1, 0).value), 46314.5);
    assert.equal(formatValue(Number(at(1, 0).value), at(1, 0).style), "19.10.2026 12:00:00");
    assert.equal(formatValue(Number(at(1, 1).value), at(1, 1).style), "36:00:00");
    assert.equal(at(2, 0).value, "=1/4");
    assert.equal(at(2, 0).style.numberPattern, "# ?/?");
    assert.equal(at(3, 0).value, "46314");
    assert.equal(formatPattern(at(2, 1).style), '#,##0.000 "$"');
  } finally { engine.destroy(); }
});
