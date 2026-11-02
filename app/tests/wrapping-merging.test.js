import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { buildLayout, textOverflow } from "../src/gridModel.js";
import { exportWorkbook, importXLSX } from "../src/files.js";
import { wrapMode } from "../shared/textWrapping.js";

test("overflow respects occupied cells, alignment, merges and controls without changing column geometry", () => {
  const sheet = { rows: 100, cols: 6, widths: { 1: 80 }, cells: {}, merges: [], validations: [] },
    text = "Long text ".repeat(10);
  let result = textOverflow(sheet, 0, 1, text, {}, text);
  assert.equal(result.offset, 0); assert(result.width > 80);
  sheet.cells["0,3"] = { value: '=IF(TRUE,"","")' };
  result = textOverflow(sheet, 0, 1, text, {}, text);
  assert.equal(result.width, 179);
  sheet.cells["0,2"] = { value: " " };
  assert.equal(textOverflow(sheet, 0, 1, text, {}, text), null);
  delete sheet.cells["0,2"];
  result = textOverflow(sheet, 0, 1, text, { align: "right" }, text);
  assert.equal(result.offset, -100); assert.equal(result.width, 179);
  result = textOverflow(sheet, 0, 1, text, { align: "center" }, text);
  assert.equal(result.offset, -100); assert.equal(result.width, 279);
  for (const style of [{ wrapMode: "clip" }, { wrap: true }, { rotation: 45 }])
    assert.equal(textOverflow(sheet, 0, 1, text, style, text), null);
  assert.equal(textOverflow(sheet, 0, 1, text, {}, 123), null);
  sheet.validations = [{ range: { r: 0, r2: 0, c: 2, c2: 2 }, type: "checkbox" }];
  assert.equal(textOverflow(sheet, 0, 1, text, {}, text), null);
  sheet.validations = []; sheet.merges = [{ r: 0, r2: 0, c: 2, c2: 3 }];
  assert.equal(textOverflow(sheet, 0, 1, text, {}, text), null);
});

test("manual newlines grow clip and overflow rows while explicit heights take precedence", () => {
  const sheet = { rows: 100, cols: 26, cells: { "0,0": { value: "one\ntwo\nthree", style: { wrapMode: "clip" } } }, widths: {}, heights: {} };
  let layout = buildLayout(sheet, () => sheet.cells["0,0"].value);
  assert(layout.heights[0] >= 55);
  sheet.heights[0] = 25; layout = buildLayout(sheet, () => sheet.cells["0,0"].value);
  assert.equal(layout.heights[0], 25);
  assert.equal(wrapMode({ wrap: true }), "wrap");
  assert.equal(wrapMode({ wrap: true, wrapMode: "clip" }), "clip");
});

function fixture() {
  const store = createStore(":memory:"), user = { id: "owner", email: "merge@example.com", name: "Owner" };
  store.db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(user.id, user.email, user.name, "hash");
  const doc = store.createDoc(user), sheetId = doc.state.sheets[0].id;
  return { store, user, doc, apply: (op) => store.apply(doc.id, user, { sheetId, ...op }) };
}

test("merge groups preserve each anchor, confirm losses atomically, reject stale confirmation and validate each group", () => {
  const { store, doc, apply } = fixture(), range = { r: 0, r2: 1, c: 0, c2: 1 };
  try {
    apply({ type: "cells", changes: [
      { key: "0,0", cell: { value: "A" } }, { key: "0,1", cell: { value: "B" } },
      { key: "1,0", cell: { value: "C" } }, { key: "1,1", cell: { value: "D" } },
    ] });
    const before = store.getDoc(doc.id);
    assert.throws(() => apply({ type: "merge", range, mode: "horizontal", action: "merge" }), /Подтвердите/);
    assert.deepEqual(store.getDoc(doc.id), before);
    assert.throws(() => apply({ type: "merge", range, mode: "horizontal", action: "merge", discard: true, expectedRevision: before.revision - 1 }), /изменились/);
    let next = apply({ type: "merge", range, mode: "horizontal", action: "merge", discard: true, expectedRevision: before.revision });
    let sheet = next.state.sheets[0];
    assert.equal(sheet.merges.length, 2); assert.equal(sheet.cells["1,0"].value, "C"); assert.equal(sheet.cells["0,1"].value, "");
    next = apply({ type: "merge", range, mode: "all", action: "merge", discard: true });
    assert.deepEqual(next.state.sheets[0].merges, [range]);
    apply({ type: "merge", range, action: "unmerge" });
    apply({ type: "cells", changes: [{ key: "0,1", cell: { value: "B" } }] });
    next = apply({ type: "merge", range, mode: "vertical", action: "merge" });
    sheet = next.state.sheets[0];
    assert.deepEqual(sheet.merges, [{ ...range, c2: 0 }, { ...range, c: 1 }]);
    assert.equal(sheet.cells["0,1"].value, "B");
    apply({ type: "merge", range, action: "unmerge" });
    apply({ type: "freeze", rows: 1 });
    apply({ type: "merge", range, mode: "horizontal", action: "merge", discard: true });
    apply({ type: "merge", range, action: "unmerge" });
    assert.throws(() => apply({ type: "merge", range, mode: "vertical", action: "merge", discard: true }), /закреплённые/);
    assert.throws(() => apply({ type: "merge", range, mode: "invalid", action: "merge", discard: true }), /диапазон/);
    assert.throws(() => apply({ type: "cells", changes: [{ key: "3,0", cell: { style: { wrapMode: "invalid" } } }] }), /переноса/);
  } finally { store.db.close(); }
});

test("Excel round trip preserves native wrapping and clip extension, including links and blank cells", async () => {
  const cells = {
    "0,0": { value: "Clipped long text", link: "https://example.com/", style: { wrapMode: "clip" } },
    "1,0": { value: "Wrapped long text", style: { wrapMode: "wrap" } },
    "2,0": { value: "Overflow text", style: { wrapMode: "overflow" } },
    "3,0": { value: "", style: { wrapMode: "clip" } },
  }, sheet = { name: "Text", rows: 1000, cols: 26, cells, widths: {} };
  const data = await exportWorkbook({ state: { sheets: [sheet] } }, (s, r, c) => cells[`${r},${c}`]?.value || ""), result = await importXLSX(data);
  const at = (r) => result.cells.find((entry) => entry.r === r && entry.c === 0).cell;
  assert.equal(wrapMode(at(0).style), "clip"); assert.equal(at(0).link, cells["0,0"].link);
  assert.equal(wrapMode(at(1).style), "wrap"); assert.equal(wrapMode(at(2).style), "overflow"); assert.equal(wrapMode(at(3).style), "clip");
});
