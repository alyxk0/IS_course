import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { formulaEngine } from "../server/formulas.js";
import {
  conditionalEvaluator,
  validationAt,
  validationMatches,
} from "../shared/rules.js";
import {
  chartData,
  chartDomain,
  chartTicks,
  chartRatio,
} from "../src/chartModel.js";
import { parseRange } from "../src/api.js";

function fixture() {
  const store = createStore(":memory:"),
    owner = { id: "owner", email: "owner@example.com", name: "Owner" },
    viewer = { id: "viewer", email: "viewer@example.com", name: "Viewer" };
  for (const user of [owner, viewer])
    store.db
      .prepare("INSERT INTO users VALUES(?,?,?,?)")
      .run(user.id, user.email, user.name, "hash");
  const doc = store.createDoc(owner),
    sheetId = doc.state.sheets[0].id;
  store.db
    .prepare("INSERT INTO permissions VALUES(?,?,?)")
    .run(doc.id, viewer.email, "viewer");
  const apply = (op) => store.apply(doc.id, owner, { sheetId, ...op }),
    cells = (changes) =>
      apply({
        type: "cells",
        changes: Object.entries(changes).map(([key, value]) => ({
          key,
          cell: { value },
        })),
      });
  return { store, owner, viewer, doc, sheetId, apply, cells };
}
test("strict validation checks evaluated formulas and rejects an entire invalid batch", () => {
  const { store, doc, apply, cells } = fixture();
  apply({
    type: "validation-set",
    rule: {
      range: { r: 0, c: 0, r2: 2, c2: 0 },
      type: "list",
      values: ["Да", "Нет"],
      reject: true,
    },
  });
  cells({ "0,0": '="Да"' });
  const revision = store.getDoc(doc.id).revision;
  assert.throws(
    () => cells({ "1,0": "Нет", "2,0": "Неизвестно" }),
    /проверке данных/,
  );
  const next = store.getDoc(doc.id);
  assert.equal(next.revision, revision);
  assert.equal(next.state.sheets[0].cells["1,0"], undefined);
  assert.equal(next.state.sheets[0].cells["0,0"].value, '="Да"');
  apply({
    type: "validation-set",
    rule: {
      range: { r: 0, c: 1, r2: 2, c2: 1 },
      type: "number",
      operator: "between",
      value: 10,
      value2: 20,
      reject: true,
    },
  });
  cells({ "0,1": "=SUM(5,10)" });
  assert.throws(() => cells({ "0,1": "50" }), /проверке данных/);
  apply({
    type: "validation-set",
    rule: {
      range: { r: 0, c: 1, r2: 2, c2: 1 },
      type: "number",
      operator: "gt",
      value: 100,
      reject: true,
    },
  });
  apply({
    type: "cells",
    changes: [{ key: "0,1", cell: { style: { bold: true } } }],
  });
  cells({ "0,0": "" });
  store.db.close();
});
test("warnings accept invalid values; new validation splits an old range without overlap", () => {
  const { store, doc, apply, cells } = fixture();
  apply({
    type: "validation-set",
    rule: { range: { r: 0, c: 0, r2: 2, c2: 2 }, type: "email", reject: false },
  });
  cells({ "0,0": "not an email" });
  let sheet = store.getDoc(doc.id).state.sheets[0];
  assert(!validationMatches(validationAt(sheet, 0, 0), "not an email"));
  apply({
    type: "validation-set",
    rule: {
      range: { r: 1, c: 1, r2: 1, c2: 1 },
      type: "checkbox",
      reject: true,
    },
  });
  sheet = store.getDoc(doc.id).state.sheets[0];
  assert.equal(sheet.validations.length, 5);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      assert.equal(
        sheet.validations.filter(
          (v) =>
            r >= v.range.r &&
            r <= v.range.r2 &&
            c >= v.range.c &&
            c <= v.range.c2,
        ).length,
        1,
      );
  cells({ "1,1": "TRUE" });
  assert.throws(() => cells({ "1,1": "maybe" }), /проверке данных/);
  apply({
    type: "structure",
    axis: "row",
    action: "insert",
    index: 0,
    count: 1,
  });
  sheet = store.getDoc(doc.id).state.sheets[0];
  assert.equal(validationAt(sheet, 2, 1).type, "checkbox");
  store.db.close();
});
test("formatting uses formula results, rule order and a three-color scale", () => {
  const { store, doc, apply, cells } = fixture(),
    range = { r: 0, c: 0, r2: 2, c2: 0 };
  cells({ "0,0": "0", "1,0": "=25*2", "2,0": "100" });
  apply({
    type: "conditional-set",
    rule: {
      range,
      condition: { type: "gt", value: 10 },
      style: { background: "#ff0000" },
    },
  });
  apply({
    type: "conditional-set",
    rule: {
      range,
      condition: { type: "notEmpty" },
      style: { background: "#0000ff" },
    },
  });
  let sheet = store.getDoc(doc.id).state.sheets[0],
    engine = formulaEngine({ sheets: [sheet] });
  const getValue = (r, c) => engine.getCellValue({ sheet: 0, row: r, col: c });
  assert.equal(
    conditionalEvaluator(sheet, getValue)(1, 0).background,
    "#ff0000",
  );
  apply({
    type: "conditional-move",
    id: sheet.conditionalFormats[1].id,
    direction: -1,
  });
  sheet = store.getDoc(doc.id).state.sheets[0];
  assert.equal(
    conditionalEvaluator(sheet, getValue)(1, 0).background,
    "#0000ff",
  );
  for (const rule of sheet.conditionalFormats)
    apply({ type: "conditional-delete", id: rule.id });
  apply({
    type: "conditional-set",
    rule: {
      range,
      condition: { type: "colorScale" },
      colors: ["#ff0000", "#ffff00", "#00ff00"],
    },
  });
  sheet = store.getDoc(doc.id).state.sheets[0];
  const style = conditionalEvaluator(sheet, getValue);
  assert.equal(style(0, 0).background, "#ff0000");
  assert.equal(style(1, 0).background, "#ffff00");
  assert.equal(style(2, 0).background, "#00ff00");
  engine.destroy();
  store.db.close();
});
test("metadata access is enforced; chart sources and rule ranges follow structural changes and restoration", () => {
  const { store, owner, viewer, doc, sheetId, apply } = fixture(),
    range = { r: 0, c: 0, r2: 4, c2: 2 };
  const chart = {
    id: "chart-test",
    type: "column",
    title: "Sales",
    range,
    header: true,
    labels: true,
    legend: true,
    includeHidden: false,
    x: 80,
    y: 70,
    width: 600,
    height: 360,
  };
  apply({ type: "chart-set", chart });
  apply({
    type: "conditional-set",
    rule: { range, condition: { type: "notEmpty" }, style: { bold: true } },
  });
  const saved = store.getDoc(doc.id).revision;
  for (const op of [
    { type: "chart-delete", id: chart.id },
    { type: "validation-set", rule: { range, type: "checkbox" } },
    {
      type: "conditional-set",
      rule: { range, condition: { type: "empty" }, style: { bold: true } },
    },
  ])
    assert.throws(
      () => store.apply(doc.id, viewer, { ...op, sheetId }),
      /прав/,
    );
  assert.throws(
    () => apply({ type: "chart-set", chart: { ...chart, width: 1 } }),
    /размеры/,
  );
  apply({
    type: "structure",
    axis: "col",
    action: "insert",
    index: 0,
    count: 1,
  });
  let next = store.getDoc(doc.id);
  assert.equal(next.state.sheets[0].charts[0].range.c, 1);
  assert.equal(next.state.sheets[0].conditionalFormats[0].range.c, 1);
  apply({ type: "chart-layout", id: chart.id, x: 230, width: 450 });
  next = store.getDoc(doc.id);
  assert.equal(next.state.sheets[0].charts[0].title, "Sales");
  apply({ type: "restore", revision: saved, expectedRevision: next.revision });
  next = store.getDoc(doc.id);
  assert.equal(next.state.sheets[0].charts[0].x, 80);
  assert.equal(next.state.sheets[0].charts[0].range.c, 0);
  assert.equal(store.role(doc.id, viewer), "viewer");
  store.db.close();
});
test("chart model preserves negatives, missing values, labels and filtered rows", () => {
  const matrix = [
    ["Month", "Income"],
    ["Jan", -5],
    ["Feb", "=not evaluated"],
    ["Mar", 20],
  ];
  const chart = {
    range: { r: 0, c: 0, r2: 3, c2: 1 },
    header: true,
    labels: true,
    includeHidden: false,
  };
  let data = chartData(
    chart,
    (r, c) => matrix[r][c],
    (r) => r !== 2,
  );
  assert.deepEqual(data.labels, ["Jan", "Mar"]);
  assert.deepEqual(data.series[0].values, [-5, 20]);
  const domain = chartDomain(data.series);
  assert(domain.min <= -5);
  assert(domain.max >= 20);
  assert(chartTicks(domain).includes(0));
  data = chartData(
    { ...chart, includeHidden: true },
    (r, c) => matrix[r][c],
    () => false,
  );
  assert.deepEqual(data.series[0].values, [-5, null, 20]);
});
test("chart axes use readable ticks and stable positions for extreme finite values", () => {
  const domain = chartDomain([{ values: [2, 4, 9] }]);
  assert.deepEqual(chartTicks(domain), [0, 2.5, 5, 7.5, 10]);
  const extreme = chartDomain([{ values: [-1e308, 1e308] }]);
  assert.equal(chartRatio(0, extreme.min, extreme.max), 0.5);
  assert(Number.isFinite(chartRatio(1e308, extreme.min, extreme.max)));
});
test("sidebar ranges support whole columns, rows and quoted sheet names", () => {
  const sheet = { name: "Данные", rows: 1000, cols: 26 };
  assert.deepEqual(parseRange("'Данные'!$B$2:C10", sheet), {
    r: 1,
    r2: 9,
    c: 1,
    c2: 2,
  });
  assert.deepEqual(parseRange("B:C", sheet), { r: 0, r2: 999, c: 1, c2: 2 });
  assert.deepEqual(parseRange("2:3", sheet), { r: 1, r2: 2, c: 0, c2: 25 });
  assert.throws(() => parseRange("Другой!A1", sheet), /текущего/);
});
test("date, email and URL validation enforce real values and evaluated dates", () => {
  const { store, apply, cells } = fixture();
  apply({
    type: "validation-set",
    rule: { range: { r: 0, c: 0, r2: 2, c2: 0 }, type: "date", reject: true },
  });
  cells({ "0,0": "2024-02-29", "2,0": "=DATE(2026,10,19)" });
  assert.throws(() => cells({ "1,0": "2023-02-29" }), /проверке данных/);
  apply({
    type: "validation-set",
    rule: { range: { r: 0, c: 1, r2: 1, c2: 1 }, type: "email", reject: true },
  });
  cells({ "0,1": "user@example.com" });
  assert.throws(() => cells({ "1,1": "bad@" }), /проверке данных/);
  apply({
    type: "validation-set",
    rule: { range: { r: 0, c: 2, r2: 1, c2: 2 }, type: "url", reject: true },
  });
  cells({ "0,2": "https://example.com/page" });
  assert.throws(
    () => cells({ "1,2": "javascript:alert(1)" }),
    /проверке данных/,
  );
  store.db.close();
});
