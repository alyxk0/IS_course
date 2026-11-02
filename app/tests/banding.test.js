import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { bandingColor, bandingStyle, normalizeBanding, bandingDataRange } from "../shared/banding.js";
import { exportWorkbook, importXLSX } from "../src/files.js";
const base = { range: { r: 1, r2: 5, c: 1, c2: 3 }, header: "#123456", first: "#ffffff", second: "#abcdef", footer: "#654321" };
test("banding range detection follows the adjacent data region and retains empty or explicit selections", () => {
  const sheet = { rows: 20, cols: 10, cells: Object.fromEntries([["1,1", "Header"], ["1,2", "Value"], ["2,1", "One"], ["2,2", "=1+2"], ["8,8", "Unrelated"]].map(([key, value]) => [key, { value }])) };
  assert.deepEqual(bandingDataRange(sheet, { r: 2, r2: 2, c: 2, c2: 2 }), { r: 1, r2: 2, c: 1, c2: 2 });
  assert.deepEqual(bandingDataRange(sheet, { r: 0, r2: 0, c: 0, c2: 0 }), { r: 0, r2: 0, c: 0, c2: 0 });
  assert.deepEqual(bandingDataRange(sheet, { r: 0, r2: 10, c: 0, c2: 5 }), { r: 0, r2: 10, c: 0, c2: 5 });
});
function fixture() {
  const store = createStore(":memory:"), owner = { id: "owner", email: "band-owner@example.com", name: "Owner" }, viewer = { id: "viewer", email: "band-viewer@example.com", name: "Viewer" };
  for (const user of [owner, viewer]) store.db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(user.id, user.email, user.name, "hash");
  const doc = store.createDoc(owner), sheetId = doc.state.sheets[0].id;
  store.db.prepare("INSERT INTO permissions VALUES(?,?,?)").run(doc.id, viewer.email, "viewer");
  return { store, owner, viewer, doc, sheetId, sheet: () => store.getDoc(doc.id).state.sheets[0], apply: (op) => store.apply(doc.id, owner, { sheetId, ...op }) };
}
test("banding header and footer take priority; row parity starts after header and covers blank cells", () => {
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => bandingColor(base, i + 1)), [base.header, base.first, base.second, base.first, base.footer]);
  assert.equal(bandingColor({ ...base, header: null }, 1), base.first);
  assert.equal(bandingColor({ ...base, footer: null }, 5), base.second);
  assert.equal(bandingColor({ ...base, range: { r: 0, r2: 0, c: 0, c2: 0 } }, 0), base.header);
  assert.deepEqual(bandingStyle({ bandedRanges: [base] }, 3, 1), { background: base.second });
  assert.deepEqual(bandingStyle({ bandedRanges: [base] }, 3, 4), {});
  assert.deepEqual(normalizeBanding({ ...base, second: "#ABCDEF", ignored: true }), base);
});
test("banding operations preserve cell formatting, reject overlaps and malformed batches atomically, and enforce permissions", () => {
  const { store, viewer, doc, sheetId, sheet, apply } = fixture();
  try {
    apply({ type: "cells", changes: [{ key: "2,1", cell: { value: "=1+2", style: { background: "#ff0000", bold: true } } }] });
    apply({ type: "banding-set", rule: base, customStyle: { header: base.header, first: base.first, second: base.second, footer: base.footer } });
    assert.equal(sheet().cells["2,1"].style.background, "#ff0000");
    assert.equal(sheet().cells["2,1"].value, "=1+2");
    assert.equal(sheet().bandedRanges.length, 1);
    assert.equal(sheet().bandingStyles[0].header, base.header);
    const snapshot = store.getDoc(doc.id);
    for (const rule of [{ ...base, first: "red" }, { ...base, header: undefined }, { ...base, range: { ...base.range, r: -1 } }, base]) {
      assert.throws(() => apply({ type: "banding-set", rule }));
      assert.deepEqual(store.getDoc(doc.id), snapshot);
    }
    assert.throws(() => store.apply(doc.id, viewer, { sheetId, type: "banding-delete", id: sheet().bandedRanges[0].id }), /прав/);
    assert.throws(() => apply({ type: "import-range", changes: [{ key: "8,0", cell: { value: "FORBIDDEN" } }], merges: [], bandedRanges: [base] }), /пересек/);
    assert.deepEqual(store.getDoc(doc.id), snapshot);
    apply({ type: "banding-delete", id: sheet().bandedRanges[0].id });
    assert.deepEqual(bandingStyle(sheet(), 2, 1), {});
    assert.equal(sheet().cells["2,1"].style.background, "#ff0000");
    assert.equal(sheet().bandingStyles[0].header, base.header);
  } finally { store.db.close(); }
});
test("banding tracks structure, deletes exhausted ranges, and refuses stale edits and deletion", () => {
  const { store, sheet, apply } = fixture();
  try {
    apply({ type: "banding-set", rule: base });
    const initial = sheet().bandedRanges[0];
    apply({ type: "structure", axis: "row", action: "insert", index: 3, count: 2 });
    assert.equal(sheet().bandedRanges[0].range.r2, 7);
    assert.equal(bandingColor(sheet().bandedRanges[0], 4), base.first);
    assert.throws(() => apply({ type: "banding-set", rule: initial, expected: initial }), /другим участником/);
    assert.throws(() => apply({ type: "banding-delete", id: initial.id, expected: initial }), /другим участником/);
    apply({ type: "structure", axis: "col", action: "delete", index: 0, count: 2 });
    assert.deepEqual(sheet().bandedRanges[0].range, { r: 1, r2: 7, c: 0, c2: 1 });
    apply({ type: "structure", axis: "row", action: "delete", index: 1, count: 7 });
    assert.deepEqual(sheet().bandedRanges, []);
  } finally { store.db.close(); }
});
test("Excel exports native conditional band fills and round-trips band metadata alongside links and wrapping", async () => {
  const { store, doc, sheet, apply } = fixture();
  try {
    apply({ type: "banding-set", rule: base });
    apply({ type: "cells", changes: [{ key: "0,0", cell: { value: "=1+2", link: "https://example.com", style: { wrapMode: "clip" } } }] });
    const bytes = await exportWorkbook(store.getDoc(doc.id), () => 3), imported = await importXLSX(bytes);
    assert.deepEqual(imported.bandedRanges, [base]);
    assert.equal(imported.cells.find((cell) => cell.r === 0 && cell.c === 0).cell.link, "https://example.com/");
    assert.equal(imported.cells.find((cell) => cell.r === 0 && cell.c === 0).cell.style.wrapMode, "clip");
    const { default: ExcelJS } = await import("exceljs"), book = new ExcelJS.Workbook(); await book.xlsx.load(bytes);
    const cf = book.worksheets[0].conditionalFormattings.find((item) => item.ref === "B2:D6");
    assert.equal(cf.rules.length, 4);
    assert.equal(cf.rules[0].formulae[0], "ROW()=2");
    assert.equal(cf.rules[0].style.fill.fgColor.argb.toLowerCase(), "ff123456");
    assert(cf.rules.some((rule) => rule.formulae[0].includes("MOD(ROW()-3,2)=1")));
    apply({ type: "import-range", changes: [], merges: [], bandedRanges: imported.bandedRanges.map((rule) => ({ ...rule, range: { ...rule.range, r: rule.range.r + 10, r2: rule.range.r2 + 10 } })) });
    assert.equal(sheet().bandedRanges.length, 2);
  } finally { store.db.close(); }
});
