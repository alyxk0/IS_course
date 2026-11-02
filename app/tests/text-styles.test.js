import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { textDecoration } from "../shared/textStyles.js";
import { normalizeCondition } from "../shared/rules.js";
import { exportWorkbook, importXLSX } from "../src/files.js";
test("underline and strike compose, and explicit false overrides a hyperlink's default underline", () => {
  assert.equal(textDecoration({}), "none");
  assert.equal(textDecoration({}, "https://example.com"), "underline");
  assert.equal(textDecoration({ underline: false }, "https://example.com"), "none");
  assert.equal(textDecoration({ underline: true, strike: true }), "underline line-through");
  const rule = { range: { r: 0, r2: 1, c: 0, c2: 1 }, condition: { type: "notEmpty" }, style: { underline: true } };
  assert(normalizeCondition(rule, 10, 10).style.underline);
  assert.throws(() => normalizeCondition({ ...rule, style: { underline: "yes" } }, 10, 10));
});
test("underline validates atomically, preserves formulas and links, and round-trips styled blank cells and explicit link formatting", async () => {
  const store = createStore(":memory:"), owner = { id: "owner", email: "underline@example.com", name: "Owner" };
  try {
    store.db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(owner.id, owner.email, owner.name, "hash");
    const doc = store.createDoc(owner), sheetId = doc.state.sheets[0].id;
    const apply = (op) => store.apply(doc.id, owner, { sheetId, ...op });
    apply({ type: "cells", changes: [
      { key: "0,0", cell: { value: "=1+2", style: { underline: true, strike: true } } },
      { key: "0,1", cell: { value: "Link", link: "https://example.com", style: { underline: false } } },
      { key: "2,2", cell: { value: "", style: { underline: true, background: "#abcdef" } } },
    ] });
    const before = store.getDoc(doc.id);
    assert.throws(() => apply({ type: "cells", changes: [{ key: "0,0", cell: { value: "FORBIDDEN" } }, { key: "0,1", cell: { style: { underline: "single" } } }] }), /начертание/);
    assert.deepEqual(store.getDoc(doc.id), before);
    const imported = await importXLSX(await exportWorkbook(before, () => 3));
    const at = (r, c) => imported.cells.find((cell) => cell.r === r && cell.c === c).cell;
    assert.equal(at(0, 0).value, "=1+2"); assert(at(0, 0).style.underline); assert(at(0, 0).style.strike);
    assert.equal(at(0, 1).link, "https://example.com/"); assert.equal(at(0, 1).style.underline, false);
    assert(at(2, 2).style.underline); assert.equal(at(2, 2).style.background.toLowerCase(), "#abcdef");
    apply({ type: "cells", changes: [{ key: "0,0", cell: { style: {} }, replaceStyle: true }] });
    assert.equal(store.getDoc(doc.id).state.sheets[0].cells["0,0"].value, "=1+2");
  } finally { store.db.close(); }
});
