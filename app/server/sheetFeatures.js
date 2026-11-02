const randomUUID = () => globalThis.crypto.randomUUID();
import { validRange, intersects } from "../shared/ranges.js";
import { normalizeBanding } from "../shared/banding.js";
import { sameCell } from "../shared/cellEquality.js";
import {
  normalizeCondition,
  normalizeValidation,
  ruleError,
} from "../shared/rules.js";
export const FEATURE_OPERATIONS = new Set([
  "banding-set",
  "banding-delete",
  "conditional-set",
  "conditional-delete",
  "conditional-move",
  "validation-set",
  "validation-delete",
  "chart-set",
  "chart-delete",
  "chart-layout",
]);
function checkId(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(id))
    ruleError("Неверный идентификатор");
  return id;
}
function subtractRange(range, cut) {
  if (!intersects(range, cut)) return [range];
  const i = {
      r: Math.max(range.r, cut.r),
      r2: Math.min(range.r2, cut.r2),
      c: Math.max(range.c, cut.c),
      c2: Math.min(range.c2, cut.c2),
    },
    parts = [];
  if (range.r < i.r) parts.push({ ...range, r2: i.r - 1 });
  if (range.r2 > i.r2) parts.push({ ...range, r: i.r2 + 1 });
  if (range.c < i.c) parts.push({ r: i.r, r2: i.r2, c: range.c, c2: i.c - 1 });
  if (range.c2 > i.c2)
    parts.push({ r: i.r, r2: i.r2, c: i.c2 + 1, c2: range.c2 });
  return parts;
}
function chartConfig(sheet, patch, previous) {
  const input = { ...previous, ...patch };
  if (
    !validRange(input.range, sheet.rows, sheet.cols) ||
    input.range.r2 - input.range.r > 999 ||
    input.range.c2 - input.range.c > 19
  )
    ruleError("Диаграмма поддерживает до 1000 строк и 20 столбцов");
  if (!["column", "bar", "line", "area", "pie", "scatter"].includes(input.type))
    ruleError("Неизвестный тип диаграммы");
  if (typeof input.title !== "string" || input.title.length > 150)
    ruleError("Неверное название диаграммы");
  const result = {
    id: checkId(input.id),
    type: input.type,
    range: {
      r: input.range.r,
      r2: input.range.r2,
      c: input.range.c,
      c2: input.range.c2,
    },
    title: input.title,
  };
  for (const k of ["header", "labels", "legend", "includeHidden"]) {
    if (typeof input[k] !== "boolean")
      ruleError("Неверные настройки диаграммы");
    result[k] = input[k];
  }
  const limits = {
    x: [0, 40000],
    y: [0, 400000],
    width: [320, 1200],
    height: [220, 900],
  };
  for (const [k, [low, high]] of Object.entries(limits)) {
    const value =
      input[k] ?? (k === "x" || k === "y" ? 80 : k === "width" ? 600 : 360);
    if (!Number.isFinite(value) || value < low || value > high)
      ruleError("Диаграмма выходит за допустимые размеры");
    result[k] = Math.round(value);
  }
  return result;
}
export function applySheetFeature(sheet, op) {
  if (op.type === "banding-set") {
    let normalized;
    try { normalized = normalizeBanding(op.rule, sheet.rows, sheet.cols); }
    catch (error) { ruleError(error.message); }
    let customStyle;
    if (op.customStyle !== undefined) {
      try { const { range, ...colors } = normalizeBanding({ ...op.customStyle, range: normalized.range }); customStyle = colors; }
      catch (error) { ruleError(error.message); }
    }
    const rules = sheet.bandedRanges || [], id = op.rule.id ? checkId(op.rule.id) : randomUUID(), index = rules.findIndex((rule) => rule.id === id);
    if (Object.hasOwn(op, "expected") && !sameCell(rules[index] || null, op.expected)) ruleError("Чередование цветов изменено другим участником. Откройте панель заново.");
    if (op.rule.id && index < 0) ruleError("Чередование цветов уже удалено. Откройте панель заново.");
    if (rules.some((rule) => rule.id !== id && intersects(rule.range, normalized.range))) ruleError("Диапазоны чередования цветов не должны пересекаться");
    if (index < 0) {
      if (rules.length >= 100) ruleError("Не более 100 диапазонов чередования цветов");
      rules.push({ ...normalized, id });
    } else rules[index] = { ...normalized, id };
    sheet.bandedRanges = rules;
    if (customStyle) sheet.bandingStyles = [...(sheet.bandingStyles || []).filter((style) => !sameCell(style, customStyle)), customStyle].slice(-6);
  } else if (op.type === "banding-delete") {
    if (Object.hasOwn(op, "expected") && !sameCell(sheet.bandedRanges?.find((rule) => rule.id === op.id) || null, op.expected)) ruleError("Чередование цветов изменено другим участником. Откройте панель заново.");
    if (!sheet.bandedRanges?.some((rule) => rule.id === op.id)) ruleError("Чередование цветов уже удалено");
    sheet.bandedRanges = sheet.bandedRanges.filter((rule) => rule.id !== op.id);
  } else if (op.type.startsWith("conditional-")) {
    const rules = sheet.conditionalFormats || [];
    if (op.type === "conditional-set") {
      const rule = {
          ...normalizeCondition(op.rule, sheet.rows, sheet.cols),
          id: op.rule.id ? checkId(op.rule.id) : randomUUID(),
        },
        index = rules.findIndex((r) => r.id === rule.id);
      if (index < 0) {
        if (rules.length >= 100)
          ruleError("Не более 100 правил форматирования");
        rules.push(rule);
      } else rules[index] = rule;
    } else {
      const index = rules.findIndex((r) => r.id === op.id);
      if (index < 0) ruleError("Правило форматирования не найдено");
      if (op.type === "conditional-delete") rules.splice(index, 1);
      else {
        if (![-1, 1].includes(op.direction)) ruleError("Неверное направление");
        const target = Math.max(
          0,
          Math.min(rules.length - 1, index + op.direction),
        );
        [rules[index], rules[target]] = [rules[target], rules[index]];
      }
    }
    sheet.conditionalFormats = rules;
  } else if (op.type === "validation-set") {
    const rule = {
      ...normalizeValidation(op.rule, sheet.rows, sheet.cols),
      id: op.rule.id ? checkId(op.rule.id) : randomUUID(),
    };
    const rules = (sheet.validations || [])
      .filter((r) => r.id !== rule.id)
      .flatMap((existing) =>
        subtractRange(existing.range, rule.range).map((range, i) => ({
          ...existing,
          range,
          id: i ? randomUUID() : existing.id,
        })),
      );
    rules.push(rule);
    if (rules.length > 100) ruleError("Не более 100 правил проверки данных");
    sheet.validations = rules;
  } else if (op.type === "validation-delete") {
    if (!(sheet.validations || []).some((r) => r.id === op.id))
      ruleError("Правило проверки не найдено");
    sheet.validations = sheet.validations.filter((r) => r.id !== op.id);
  } else if (op.type === "chart-set") {
    const charts = sheet.charts || [],
      index = charts.findIndex((c) => c.id === op.chart?.id),
      chart = chartConfig(sheet, op.chart, charts[index]);
    if (index < 0) {
      if (charts.length >= 20) ruleError("Не более 20 диаграмм на листе");
      charts.push(chart);
    } else charts[index] = chart;
    sheet.charts = charts;
  } else {
    const charts = sheet.charts || [],
      index = charts.findIndex((c) => c.id === op.id);
    if (index < 0) ruleError("Диаграмма не найдена");
    if (op.type === "chart-delete") charts.splice(index, 1);
    else {
      const patch = {};
      for (const key of ["x", "y", "width", "height"])
        if (op[key] !== undefined) patch[key] = op[key];
      charts[index] = chartConfig(sheet, patch, charts[index]);
    }
    sheet.charts = charts;
  }
}
