import { test } from "node:test";
import assert from "node:assert/strict";
import { createTemporaryView, projectTemporaryView } from "../src/temporaryView.js";
import { validationAt } from "../shared/rules.js";
import { buildLayout } from "../src/gridModel.js";

function fixture() {
  return {
    id: "sheet", rows: 1000, cols: 26, widths: {}, cells: {
      "0,0": { value: "Name" }, "0,1": { value: "Value" },
      "1,0": { value: "Bravo", link: "https://example.com/bravo" },
      "1,1": { value: "10", style: { background: "#ff0000" } },
      "2,0": { value: "Alpha" }, "2,1": { value: "20" },
      "3,0": { value: "Charlie" }, "3,1": { value: "30" },
      "2,2": { value: "Outside" },
    }, merges: [], validations: [{ id: "v", range: { r: 1, c: 1, r2: 1, c2: 2 }, type: "number" }],
  };
}
const range = { r: 0, c: 0, r2: 3, c2: 1 };
test("private sorting projects coordinates, styles and links without changing shared cells", () => {
  const sheet = fixture(), before = structuredClone(sheet),
    view = { ...createTemporaryView(sheet, range), sort: { col: 0, desc: false } },
    result = projectTemporaryView(sheet, view, (r, c) => sheet.cells[`${r},${c}`]?.value || "");
  assert.equal(result.sheet.cells["1,0"].value, "Alpha");
  assert.equal(result.sheet.cells["2,0"].link, "https://example.com/bravo");
  assert.equal(result.sheet.cells["2,1"].style.background, "#ff0000");
  assert.equal(result.sheet.cells["2,2"].value, "Outside");
  assert.deepEqual(result.sourceAt(1, 0), { r: 2, c: 0 });
  assert.deepEqual(result.viewAt(1, 0), { r: 2, c: 0 });
  assert.deepEqual(result.sourceAt(1, 2), { r: 1, c: 2 });
  assert.equal(validationAt(result.sheet, 2, 1)?.id, "v");
  assert.equal(validationAt(result.sheet, 1, 2)?.id, "v");
  assert.equal(validationAt(result.sheet, 1, 1), undefined);
  assert.deepEqual(sheet, before);
});
test("private filters override a copy of shared criteria and follow projected values", () => {
  const sheet = fixture();
  sheet.filter = { range, criteria: { 0: { values: ["Bravo"] } } };
  const view = createTemporaryView(sheet, range);
  view.filter.criteria[0].values = ["Alpha"];
  view.sort = { col: 1, desc: true };
  const result = projectTemporaryView(sheet, view, (r, c) => sheet.cells[`${r},${c}`]?.value || "");
  const layout = buildLayout(result.sheet, (r, c) => result.sheet.cells[`${r},${c}`]?.value || "");
  assert.deepEqual(layout.rows.slice(0, 3), [0, 2, 4]);
  assert.deepEqual(sheet.filter.criteria[0].values, ["Bravo"]);
});
test("sorting uses calculated numeric values, is stable on ties and refreshes for remote changes", () => {
  const sheet = fixture(), view = { ...createTemporaryView(sheet, range), sort: { col: 1, desc: false } };
  const value = (r) => ({ 1: 9, 2: 100, 3: 9 })[r];
  let result = projectTemporaryView(sheet, view, value);
  assert.deepEqual([1, 2, 3].map((r) => result.sourceAt(r, 1).r), [1, 3, 2]);
  result = projectTemporaryView(sheet, view, (r) => r === 2 ? -1 : value(r));
  assert.equal(result.sourceAt(1, 1).r, 2);
  for (const desc of [false, true]) {
    result = projectTemporaryView(sheet, { ...view, sort: { col: 1, desc } }, (r) => r === 2 ? "" : value(r));
    assert.equal(result.sourceAt(3, 1).r, 2);
  }
});
test("structural changes invalidate a view; vertical and boundary merges are rejected", () => {
  const sheet = fixture(), view = createTemporaryView(sheet, range);
  assert.equal(projectTemporaryView({ ...sheet, rows: 1001 }, view, () => ""), null);
  sheet.merges = [{ r: 1, c: 0, r2: 2, c2: 0 }];
  assert.throws(() => createTemporaryView(sheet, range), /объедин/);
  sheet.merges = [{ r: 1, c: 1, r2: 1, c2: 2 }];
  assert.throws(() => createTemporaryView(sheet, range), /объедин/);
  sheet.merges = [{ r: 1, c: 0, r2: 1, c2: 1 }];
  const next = { ...createTemporaryView(sheet, range), sort: { col: 0, desc: false } };
  const result = projectTemporaryView(sheet, next, (r, c) => sheet.cells[`${r},${c}`]?.value || "");
  assert.deepEqual(result.sheet.merges[0], { r: 2, r2: 2, c: 0, c2: 1 });
});
