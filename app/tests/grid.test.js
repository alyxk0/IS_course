import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLayout, windowRows, expandSelection } from "../src/gridModel.js";
test("filters hide matching rows while preserving physical addresses and virtualization geometry", () => {
  const sheet = {
    rows: 200,
    cols: 26,
    cells: {},
    widths: {},
    frozen: 1,
    filter: {
      range: { r: 0, c: 0, r2: 4, c2: 1 },
      criteria: { 1: { values: ["Москва"] } },
    },
  };
  const values = ["Город", "Москва", "Казань", "Москва", "Казань"];
  const layout = buildLayout(sheet, (r, c) => (c === 1 ? values[r] || "" : ""));
  assert.deepEqual(layout.rows.slice(0, 5), [0, 1, 3, 5, 6]);
  assert.equal(layout.positions[2], -1);
  assert.equal(layout.positions[3], 2);
  assert.equal(layout.offsets[3], 63);
  const window = windowRows(sheet, layout, 2000, 500, 100);
  assert.equal(window.indexes[0], 0);
  assert(window.top > 0);
  assert(window.bottom > 0);
});
test("virtual rows include the anchor and extent of a merged cell intersecting the viewport", () => {
  const sheet = {
    rows: 200,
    cols: 26,
    cells: {},
    widths: {},
    merges: [{ r: 10, c: 0, r2: 50, c2: 2 }],
  };
  const layout = buildLayout(sheet, () => ""),
    window = windowRows(sheet, layout, 40 * 24, 200, 100);
  assert(window.indexes.includes(10));
  assert(window.indexes.includes(50));
  assert.deepEqual(expandSelection(sheet, { r: 20, c: 1, r2: 20, c2: 1 }), {
    r: 10,
    c: 0,
    r2: 50,
    c2: 2,
  });
});
test("wrapping expands row height, merged widths are included, print excludes unused rows", () => {
  const sheet = {
    rows: 200,
    cols: 26,
    widths: { 0: 100 },
    cells: { "0,0": { value: "long text", style: { wrap: true } } },
    merges: [],
  };
  const layout = buildLayout(
    sheet,
    () =>
      "Long content repeated many times, with a second line\nand a third line",
  );
  assert(layout.heights[0] > 24);
  sheet.merges = [{ r: 0, c: 0, r2: 0, c2: 3 }];
  const merged = buildLayout(
    sheet,
    () =>
      "Long content repeated many times, with a second line\nand a third line",
    true,
  );
  assert(merged.heights[0] < layout.heights[0]);
  assert.equal(merged.rows.length, 1);
  assert.equal(merged.cols, 4);
});
