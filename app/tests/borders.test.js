import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { borderAt, borderChanges, synchronizeBorders, validBorders, mergeStyles } from "../shared/borders.js";
import { exportWorkbook, importXLSX } from "../src/files.js";
import { captureFormats, paintFormats } from "../src/formatPainter.js";
import { captureClipboard, relocateClipboard } from "../src/clipboard.js";

const red = { line: "thick", color: "#ff0000" }, blue = { line: "double", color: "#0000ff" };
function setup() {
  const store = createStore(":memory:"), user = { id: "owner", email: "borders@example.com", name: "Owner" };
  store.db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(user.id, user.email, user.name, "hash");
  const doc = store.createDoc(user), sheetId = doc.state.sheets[0].id,
    sheet = () => store.getDoc(doc.id).state.sheets[0],
    apply = (op) => store.apply(doc.id, user, { sheetId, ...op }),
    cells = (changes) => apply({ type: "cells", changes: synchronizeBorders(sheet(), changes) });
  return { store, doc, user, sheetId, sheet, apply, cells };
}

test("border presets synchronize shared edges and clear formatting without erasing other edges or values", () => {
  const { store, sheet, cells } = setup();
  try {
    cells([{ key: "1,1", cell: { value: "=1+2", style: { bold: true } } }]);
    cells(borderChanges(sheet(), { r: 1, r2: 2, c: 1, c2: 2 }, "outer", { ...red, customColors: ["#123456"] }));
    assert.deepEqual(borderAt(sheet(), 1, 1, "top"), red);
    assert.equal(borderAt(sheet(), 1, 1, "right"), null);
    assert.deepEqual(borderAt(sheet(), 0, 1, "bottom"), red);
    cells(borderChanges(sheet(), { r: 1, r2: 2, c: 1, c2: 2 }, "inner", blue));
    assert.deepEqual(borderAt(sheet(), 1, 1, "right"), blue);
    assert.deepEqual(borderAt(sheet(), 1, 2, "left"), blue);
    cells([{ key: "1,1", cell: { style: {} }, replaceStyle: true }]);
    assert.equal(borderAt(sheet(), 1, 1, "right"), null);
    assert.equal(borderAt(sheet(), 0, 1, "bottom"), null);
    assert.deepEqual(borderAt(sheet(), 1, 2, "right"), red);
    assert.equal(sheet().cells["1,1"].value, "=1+2");
    assert.deepEqual(sheet().cells["1,1"].style, {});
    assert.deepEqual(mergeStyles({ borders: { top: red } }, { borders: { left: blue } }).borders, { top: red, left: blue });
  } finally { store.db.close(); }
});

test("merged cells retain physical perimeter borders through clearing, clipboard and format painting", () => {
  const { store, sheet, apply, cells } = setup(), range = { r: 1, r2: 2, c: 1, c2: 2 };
  try {
    cells([{ key: "1,1", cell: { value: "Merged" } }]);
    apply({ type: "merge", action: "merge", range });
    cells(borderChanges(sheet(), range, "all", red));
    assert.equal(borderAt(sheet(), 1, 1, "right"), null);
    assert.deepEqual(borderAt(sheet(), 2, 2, "right"), red);
    const clip = captureClipboard(sheet(), range), target = { r: 4, c: 4 }, copied = relocateClipboard(clip, sheet(), target, [sheet()]);
    assert(copied.changes.some((c) => c.key === "5,5" && c.cell.style?.borders));
    apply({ type: "import-range", changes: copied.changes, merges: copied.merges });
    assert.deepEqual(borderAt(sheet(), 5, 5, "right"), red);
    assert.equal(sheet().cells["4,4"].value, "Merged");
    cells([{ key: "1,1", cell: { style: {} }, replaceStyle: true }]);
    assert.equal(borderAt(sheet(), 2, 2, "right"), null);
    const formats = captureFormats(sheet(), { r: 4, r2: 5, c: 4, c2: 5 });
    cells(paintFormats(sheet(), formats, range));
    assert.deepEqual(borderAt(sheet(), 2, 2, "bottom"), red);
    assert.equal(sheet().cells["1,1"].value, "Merged");
    assert.throws(() => apply({ type: "cells", changes: [{ key: "2,2", cell: { value: "FORBIDDEN" } }] }), /часть объедин/);
  } finally { store.db.close(); }
});

test("border schema is checked atomically and legacy borders remain visible", () => {
  const { store, sheet, apply, cells, doc } = setup();
  try {
    cells([{ key: "0,0", cell: { style: { border: true } } }]);
    assert.deepEqual(borderAt(sheet(), 0, 0, "left"), { line: "thin", color: "#5f6368" });
    const before = store.getDoc(doc.id);
    for (const invalid of [null, [], { diagonal: red }, { top: { ...red, extra: true } }, { right: { line: "eval()", color: "#000000" } }, { bottom: { line: "thin", color: "url(bad)" } }]) {
      assert.equal(!!validBorders(invalid), false);
      assert.throws(() => apply({ type: "cells", changes: [{ key: "0,0", cell: { value: "FORBIDDEN", style: { borders: invalid } } }] }), /границы/);
      assert.deepEqual(store.getDoc(doc.id), before);
    }
  } finally { store.db.close(); }
});

test("shared border conflict resolution is identical from both cells", () => {
  const sheet = { rows: 10, cols: 10, cells: { "0,0": { style: { borders: { right: red } } }, "0,1": { style: { borders: { left: blue } } } } };
  assert.deepEqual(borderAt(sheet, 0, 0, "right"), blue);
  assert.deepEqual(borderAt(sheet, 0, 1, "left"), blue);
});

test("resetting text and fill colors removes only those properties, preserving merged perimeter and values", () => {
  const { store, sheet, apply, cells } = setup();
  try {
    cells([{ key: "1,1", cell: { value: "=1+2", style: { bold: true, color: "#123456", background: "#abcdef" } } }]);
    apply({ type: "merge", action: "merge", range: { r: 1, r2: 2, c: 1, c2: 2 } });
    cells(borderChanges(sheet(), { r: 1, r2: 1, c: 1, c2: 1 }, "top", red));
    const before = structuredClone(sheet().cells);
    cells([{ key: "1,1", cell: { style: { color: null, background: null } } }]);
    assert.equal(sheet().cells["1,1"].style.color, undefined);
    assert.equal(sheet().cells["1,1"].style.background, undefined);
    assert.equal(sheet().cells["1,1"].style.bold, true);
    assert.equal(sheet().cells["1,1"].value, "=1+2");
    assert.deepEqual(sheet().cells["1,1"].style.borders, before["1,1"].style.borders);
    assert.deepEqual(borderAt(sheet(), 1, 1, "top"), red);
    assert.equal(borderAt(sheet(), 1, 2, "top"), null);
    assert.throws(() => cells([{ key: "1,1", cell: { style: { color: "red" } } }]), /цвет/);
  } finally { store.db.close(); }
});

test("native Excel border styles preserve colored sides, merged perimeter segments and blank ranges", async () => {
  const { store, doc, sheet, apply, cells } = setup();
  try {
    apply({ type: "merge", action: "merge", range: { r: 1, r2: 2, c: 1, c2: 2 } });
    cells(borderChanges(sheet(), { r: 1, r2: 2, c: 1, c2: 2 }, "outer", blue));
    cells(borderChanges(sheet(), { r: 4, r2: 5, c: 4, c2: 5 }, "all", red));
    const data = await exportWorkbook(store.getDoc(doc.id), () => ""), imported = await importXLSX(data);
    const result = { ...sheet(), cells: Object.fromEntries(imported.cells.map((v) => [`${v.r},${v.c}`, v.cell])), merges: imported.merges };
    assert.deepEqual(borderAt(result, 2, 2, "right"), blue);
    assert.deepEqual(borderAt(result, 5, 5, "bottom"), red);
    assert.deepEqual(borderAt(result, 4, 4, "right"), red);
    assert.equal(imported.merges.length, 1);
  } finally { store.db.close(); }
});
