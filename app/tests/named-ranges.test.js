import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { formulaEngine } from "../shared/formulaEngine.js";
import { validRangeName, namedRangeAddress, renameRangeInFormula } from "../shared/namedRanges.js";
import { parseNamedTarget } from "../src/namedRangeModel.js";
import { exportWorkbook, importXLSX } from "../src/files.js";
import { captureClipboard, relocateClipboard } from "../src/clipboard.js";
import { toEngineFormula, fromEngineFormula } from "../shared/namedRanges.js";
function fixture() {
  const store = createStore(":memory:"), owner = { id: "owner", email: "named@example.com", name: "Owner" };
  store.db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(owner.id, owner.email, owner.name, "hash");
  const doc = store.createDoc(owner), sheetId = doc.state.sheets[0].id;
  return { store, owner, doc, sheetId, apply: op => store.apply(doc.id, owner, { sheetId, ...op }), read: () => store.getDoc(doc.id) };
}
function value(state, sheet, r, c) { const engine = formulaEngine(state); try { const v = engine.getCellValue({ sheet: engine.getSheetId(sheet), row: r, col: c }); return v && typeof v === "object" ? v.value : v; } finally { engine.destroy(); } }
test("named-range names, quoted sheet parsing, whole rows/columns and formula rename tokens preserve strings, functions and sheet names", () => {
  for (const name of ["Budget", "Бюджет_итого", "_budget", "Доходы2026"]) assert(validRangeName(name), name);
  for (const name of ["", "A1", "R1C1", "R", "C", "true", "FalseBudget", "1Budget", "a b", "a.b", "a-1", "a".repeat(251)]) assert(!validRangeName(name), name);
  const sheet = { id: "s", name: "O'Brien Данные", rows: 1000, cols: 26 };
  const item = { name: "Budget", ...parseNamedTarget("'O''Brien Данные'!$B$2:$C$8", [sheet], "s") };
  assert.deepEqual(item.range, { r: 1, r2: 7, c: 1, c2: 2 });
  assert.equal(namedRangeAddress(item, [sheet], true), "'O''Brien Данные'!$B$2:$C$8");
  assert(parseNamedTarget("B:C", [sheet], "s").allRows); assert(parseNamedTarget("2:4", [sheet], "s").allCols);
  assert.throws(() => parseNamedTarget("Missing!A1", [sheet], "s"), /Лист/);
  assert.equal(renameRangeInFormula('=SUM(budget)+Budget!A1+"Budget"+\'Budget\'!B2+BudgetExtra+Budget(A1)', "Budget", "Total"), '=SUM(Total)+Budget!A1+"Budget"+\'Budget\'!B2+BudgetExtra+Budget(A1)');
});
test("named ranges calculate across sheets, rename references without changing literal text, update ranges and reject duplicates/stale edits atomically", () => {
  const f = fixture();
  try {
    f.apply({ type: "cells", changes: [{ key: "0,0", cell: { value: "2" } }, { key: "1,0", cell: { value: "3" } }, { key: "0,2", cell: { value: "=SUM(Бюджет)" } }, { key: "1,2", cell: { value: "=Бюджет", literal: true } }] });
    f.apply({ type: "named-range-set", namedRange: { name: "Бюджет", sheetId: f.sheetId, range: { r: 0, r2: 1, c: 0, c2: 0 } } });
    let current = f.read(), item = current.state.namedRanges[0]; assert.equal(value(current.state, "Лист1", 0, 2), 5);
    f.apply({ type: "sheet-add" }); const other = f.read().state.sheets[1];
    f.apply({ type: "cells", sheetId: other.id, changes: [{ key: "0,0", cell: { value: "=SUM(бюджет)" } }, { key: "1,0", cell: { value: '=IF(TRUE,"Бюджет","test")' } }] });
    f.apply({ type: "named-range-set", id: item.id, expected: item, namedRange: { ...item, name: "Total" } });
    current = f.read(); assert.equal(current.state.sheets[1].cells["0,0"].value, "=SUM(Total)"); assert.equal(value(current.state, other.name, 0, 0), 5);
    assert.equal(current.state.sheets[0].cells["1,2"].value, "=Бюджет"); assert.equal(value(current.state, other.name, 1, 0), "Бюджет");
    const before = f.read(); assert.throws(() => f.apply({ type: "named-range-set", id: item.id, expected: item, namedRange: { ...item, name: "Old" } }), /изменился/); assert.deepEqual(f.read(), before);
    assert.throws(() => f.apply({ type: "named-range-set", namedRange: { ...item, name: "total" } }), /уже существует/); assert.deepEqual(f.read(), before);
    item = current.state.namedRanges[0]; f.apply({ type: "named-range-set", id: item.id, expected: item, namedRange: { ...item, range: { r: 1, r2: 1, c: 0, c2: 0 } } });
    assert.equal(value(f.read().state, other.name, 0, 0), 3);
    item = f.read().state.namedRanges[0]; f.apply({ type: "named-range-delete", id: item.id, expected: item }); assert.equal(value(f.read().state, other.name, 0, 0), "#NAME?");
  } finally { f.store.db.close(); }
});
test("named ranges follow structural edits and sheet rename, retain broken references after deletion, and whole columns follow growth", () => {
  const f = fixture();
  try {
    f.apply({ type: "named-range-set", namedRange: { name: "Budget", sheetId: f.sheetId, range: { r: 1, r2: 3, c: 0, c2: 0 } } });
    f.apply({ type: "named-range-set", namedRange: { name: "AllValues", sheetId: f.sheetId, range: { r: 0, r2: 999, c: 1, c2: 1 }, allRows: true } });
    f.apply({ type: "structure", axis: "row", action: "insert", index: 2, count: 2 });
    assert.deepEqual(f.read().state.namedRanges[0].range, { r: 1, r2: 5, c: 0, c2: 0 });
    assert.equal(f.read().state.namedRanges[1].range.r2, 1001);
    f.apply({ type: "grow", rows: 100 }); assert.equal(f.read().state.namedRanges[1].range.r2, 1101);
    f.apply({ type: "sheet-rename", name: "Данные 2026" }); assert.match(namedRangeAddress(f.read().state.namedRanges[0], f.read().state.sheets), /^'Данные 2026'/);
    f.apply({ type: "cells", changes: [{ key: "0,4", cell: { value: "=SUM(Budget)" } }] });
    f.apply({ type: "structure", axis: "row", action: "delete", index: 1, count: 5 });
    assert.equal(f.read().state.namedRanges[0].range, null); assert.equal(value(f.read().state, "Данные 2026", 0, 4), "#REF!");
    f.apply({ type: "sheet-add" }); f.apply({ type: "sheet-delete" }); assert.equal(f.read().state.namedRanges[1].range, null);
  } finally { f.store.db.close(); }
});
test("named-range writes enforce fresh server permissions and import collisions roll back all imported cells", () => {
  const f = fixture();
  try {
    const input = { name: "Budget", sheetId: f.sheetId, range: { r: 0, r2: 0, c: 0, c2: 0 } };
    for (const role of ["viewer", "commenter", "editor"]) {
      const user = { id: role, email: `${role}@example.com`, name: role };
      f.store.db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(user.id, user.email, user.name, "hash");
      f.store.db.prepare("INSERT INTO permissions VALUES(?,?,?)").run(f.doc.id, user.email, role);
      const op = { type: "named-range-set", namedRange: input };
      if (role !== "editor") assert.throws(() => f.store.apply(f.doc.id, user, op), /Недостаточно прав/);
      else { f.store.apply(f.doc.id, user, op); f.store.db.prepare("UPDATE permissions SET role='viewer' WHERE email=?").run(user.email); assert.throws(() => f.store.apply(f.doc.id, user, { ...op, namedRange: { ...input, name: "Other" } }), /Недостаточно прав/); }
    }
    const before = f.read();
    assert.throws(() => f.apply({ type: "import-range", changes: [{ key: "0,0", cell: { value: "FORBIDDEN" } }], merges: [], namedRanges: [input] }), /уже существует/);
    assert.deepEqual(f.read(), before);
  } finally { f.store.db.close(); }
});
test("XLSX exports native defined names including quoted sheet names and imports first-sheet ranges, whole columns and formulas", async () => {
  const f = fixture();
  try {
    f.apply({ type: "sheet-rename", name: "O'Brien Данные" });
    f.apply({ type: "cells", changes: [{ key: "0,0", cell: { value: "4" } }, { key: "0,2", cell: { value: "=SUM(Budget)" } }] });
    f.apply({ type: "named-range-set", namedRange: { name: "Budget", sheetId: f.sheetId, range: { r: 0, r2: 1, c: 0, c2: 0 } } });
    f.apply({ type: "named-range-set", namedRange: { name: "FullValues", sheetId: f.sheetId, range: { r: 0, r2: 999, c: 1, c2: 1 }, allRows: true } });
    f.apply({ type: "named-range-set", namedRange: { name: "_OpenSheetsList1", sheetId: f.sheetId, range: { r: 0, r2: 0, c: 0, c2: 0 } } });
    f.apply({ type: "validation-set", rule: { range: { r: 5, r2: 5, c: 0, c2: 0 }, type: "list", values: Array.from({ length: 40 }, (_, i) => `Item ${i} long text`), reject: false } });
    const buffer = await exportWorkbook(f.read(), () => 4), { default: JSZip } = await import("jszip"), zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("xl/workbook.xml").async("string"); assert.match(xml, /definedName name="Budget"/); assert.match(xml, /\$B:\$B/);
    assert.match(xml, /definedName name="_OpenSheetsList1_1"/);
    const imported = await importXLSX(buffer); assert.equal(imported.namedRanges.length, 3); assert.equal(imported.namedRanges[1].allRows, true); assert.deepEqual(imported.namedRanges[0].range, { r: 0, r2: 1, c: 0, c2: 0 });
    const target = f.store.createDoc(f.owner); f.store.apply(target.id, f.owner, { type: "import-range", sheetId: target.state.sheets[0].id, changes: imported.cells.map(({ r,c,cell }) => ({ key: `${r},${c}`, cell, replace: true })), merges: [], namedRanges: imported.namedRanges });
    assert.equal(value(f.store.getDoc(target.id).state, "Лист1", 0, 2), 4);
  } finally { f.store.db.close(); }
});
test("formula aliases stay inside the engine through copying, structural serialization, scientific notation and boolean constants", () => {
  const f = fixture();
  try {
    f.apply({ type: "cells", changes: [{ key: "0,0", cell: { value: "2" } }, { key: "0,2", cell: { value: '=SUM(Бюджет)+A1+$A$1+1E-3+IF(TRUE,1,0)' } }] });
    f.apply({ type: "named-range-set", namedRange: { name: "Бюджет", sheetId: f.sheetId, range: { r: 0, r2: 0, c: 0, c2: 0 } } });
    let doc = f.read(), sheet = doc.state.sheets[0]; assert.equal(value(doc.state, sheet.name, 0, 2), 7.001);
    const payload = captureClipboard(sheet, { r: 0, r2: 0, c: 2, c2: 2 });
    const relocated = relocateClipboard(payload, sheet, { r: 5, c: 2 }, doc.state.sheets, doc.state.namedRanges);
    assert.match(relocated.changes[0].cell.value, /SUM\(Бюджет\)\+A6\+\$A\$1/); assert(!relocated.changes[0].cell.value.includes("_osnr_"));
    f.apply({ type: "structure", axis: "row", action: "insert", index: 0, count: 1 });
    doc = f.read(); assert(!JSON.stringify(doc).includes("_osnr_")); assert.equal(value(doc.state, sheet.name, 1, 2), 7.001);
    const formula = '=SUM(A:A)+SUM($B:$B)+1E-3+IF(FALSE,1,2)+SUM(Бюджет)';
    assert.equal(fromEngineFormula(toEngineFormula(formula), doc.state.namedRanges), formula.replace("1E-3", "0.001"));
  } finally { f.store.db.close(); }
});
