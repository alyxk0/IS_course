import { contains, validRange } from "./ranges.js";

export const CONDITIONS = {
  notEmpty: "Не пусто",
  empty: "Пусто",
  gt: "Больше",
  gte: "Больше или равно",
  lt: "Меньше",
  lte: "Меньше или равно",
  eq: "Равно",
  neq: "Не равно",
  between: "Между",
  textEquals: "Текст в точности",
  contains: "Текст содержит",
  notContains: "Текст не содержит",
  startsWith: "Текст начинается с",
  endsWith: "Текст заканчивается на",
  duplicate: "Значение повторяется",
  colorScale: "Цветовая шкала",
};
export const VALIDATION_TYPES = {
  list: "Раскрывающийся список",
  number: "Число",
  date: "Дата",
  email: "Адрес электронной почты",
  url: "URL",
  checkbox: "Флажок",
};
export function ruleError(message) {
  throw Object.assign(new Error(message), { status: 400 });
}
const color = (value) =>
  typeof value === "string" && /^#[a-f\d]{6}$/i.test(value);
export const numeric = (value) =>
  typeof value === "number" && Number.isFinite(value);
export function normalizeCondition(input, rows, cols) {
  if (
    !input ||
    !validRange(input.range, rows, cols) ||
    !Object.hasOwn(CONDITIONS, input.condition?.type)
  )
    ruleError("Проверьте диапазон и условие форматирования");
  const { type } = input.condition,
    condition = { type };
  if (["gt", "gte", "lt", "lte", "eq", "neq", "between"].includes(type)) {
    if (!numeric(input.condition.value))
      ruleError("Введите числовое значение условия");
    condition.value = input.condition.value;
    if (type === "between") {
      if (
        !numeric(input.condition.value2) ||
        input.condition.value2 < condition.value
      )
        ruleError("Проверьте границы числового диапазона");
      condition.value2 = input.condition.value2;
    }
  } else if (
    [
      "textEquals",
      "contains",
      "notContains",
      "startsWith",
      "endsWith",
    ].includes(type)
  ) {
    if (
      typeof input.condition.value !== "string" ||
      input.condition.value.length > 1000
    )
      ruleError("Неверное текстовое условие");
    condition.value = input.condition.value;
  }
  const style = {};
  if (type === "colorScale") {
    if (
      !Array.isArray(input.colors) ||
      input.colors.length !== 3 ||
      !input.colors.every(color)
    )
      ruleError("Выберите три цвета шкалы");
  } else {
    for (const key of ["color", "background"])
      if (input.style?.[key] !== undefined) {
        if (!color(input.style[key])) ruleError("Неверный цвет оформления");
        style[key] = input.style[key];
      }
    for (const key of ["bold", "italic", "strike", "underline"])
      if (input.style?.[key] !== undefined) {
        if (typeof input.style[key] !== "boolean")
          ruleError("Неверное оформление");
        style[key] = input.style[key];
      }
    if (!Object.keys(style).length)
      ruleError("Выберите оформление для правила");
  }
  return {
    range: {
      r: input.range.r,
      r2: input.range.r2,
      c: input.range.c,
      c2: input.range.c2,
    },
    condition,
    style,
    ...(type === "colorScale" ? { colors: [...input.colors] } : {}),
  };
}
export function normalizeValidation(input, rows, cols) {
  if (
    !input ||
    !validRange(input.range, rows, cols) ||
    !Object.hasOwn(VALIDATION_TYPES, input.type)
  )
    ruleError("Проверьте диапазон и критерий проверки данных");
  const result = {
    range: {
      r: input.range.r,
      r2: input.range.r2,
      c: input.range.c,
      c2: input.range.c2,
    },
    type: input.type,
    reject: input.reject !== false,
  };
  if (input.type === "list") {
    if (
      !Array.isArray(input.values) ||
      input.values.length < 1 ||
      input.values.length > 100 ||
      input.values.some(
        (v) => typeof v !== "string" || !v.trim() || v.length > 200,
      )
    )
      ruleError("Введите от 1 до 100 непустых вариантов списка");
    result.values = [...new Set(input.values)];
  } else if (input.type === "number") {
    if (
      !["any", "gt", "gte", "lt", "lte", "eq", "neq", "between"].includes(
        input.operator,
      )
    )
      ruleError("Неизвестная проверка числа");
    result.operator = input.operator;
    if (input.operator !== "any") {
      if (!numeric(input.value)) ruleError("Введите число для проверки");
      result.value = input.value;
      if (input.operator === "between") {
        if (!numeric(input.value2) || input.value2 < input.value)
          ruleError("Проверьте границы числового диапазона");
        result.value2 = input.value2;
      }
    }
  }
  return result;
}
export function conditionMatches(condition, value, counts) {
  const { type } = condition,
    blank = value === null || value === undefined || value === "";
  if (type === "empty") return blank;
  if (type === "notEmpty") return !blank;
  if (type === "duplicate")
    return !blank && (counts?.get(String(value).toLocaleLowerCase()) || 0) > 1;
  const text = String(value ?? "").toLocaleLowerCase(),
    target = String(condition.value ?? "").toLocaleLowerCase();
  if (type === "textEquals") return text === target;
  if (type === "contains") return text.includes(target);
  if (type === "notContains") return !text.includes(target);
  if (type === "startsWith") return text.startsWith(target);
  if (type === "endsWith") return text.endsWith(target);
  if (!numeric(value)) return false;
  if (type === "gt") return value > condition.value;
  if (type === "gte") return value >= condition.value;
  if (type === "lt") return value < condition.value;
  if (type === "lte") return value <= condition.value;
  if (type === "eq") return value === condition.value;
  if (type === "neq") return value !== condition.value;
  if (type === "between")
    return value >= condition.value && value <= condition.value2;
  return false;
}
function blend(a, b, ratio) {
  const rgb = [1, 3, 5].map((i) =>
    Math.round(
      parseInt(a.slice(i, i + 2), 16) * (1 - ratio) +
        parseInt(b.slice(i, i + 2), 16) * ratio,
    )
      .toString(16)
      .padStart(2, "0"),
  );
  return "#" + rgb.join("");
}
export function conditionalEvaluator(sheet, getValue) {
  const rules = (sheet?.conditionalFormats || []).map((rule) => {
    const counts = new Map();
    let min = Infinity,
      max = -Infinity;
    if (["duplicate", "colorScale"].includes(rule.condition.type))
      for (const [key, cell] of Object.entries(sheet.cells)) {
        const [r, c] = key.split(",").map(Number);
        if (!contains(rule.range, r, c)) continue;
        const value = getValue(r, c);
        if (value !== "" && value !== null && value !== undefined)
          counts.set(
            String(value).toLocaleLowerCase(),
            (counts.get(String(value).toLocaleLowerCase()) || 0) + 1,
          );
        if (numeric(value)) {
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      }
    return { ...rule, counts, min, max };
  });
  return (r, c) => {
    let value;
    for (const rule of rules) {
      if (!contains(rule.range, r, c)) continue;
      value ??= getValue(r, c);
      if (rule.condition.type === "colorScale") {
        if (!numeric(value) || rule.min === Infinity) continue;
        const scale = Math.max(Math.abs(rule.min), Math.abs(rule.max)) || 1;
        const ratio =
          rule.max === rule.min
            ? 0.5
            : Math.max(
                0,
                Math.min(
                  1,
                  (value / scale - rule.min / scale) /
                    (rule.max / scale - rule.min / scale),
                ),
              );
        return {
          background:
            ratio <= 0.5
              ? blend(rule.colors[0], rule.colors[1], ratio * 2)
              : blend(rule.colors[1], rule.colors[2], (ratio - 0.5) * 2),
        };
      }
      if (conditionMatches(rule.condition, value, rule.counts))
        return rule.style;
    }
    return {};
  };
}
export function validationAt(sheet, r, c) {
  return sheet?.validations?.find((rule) => contains(rule.range, r, c));
}
export function validationMatches(rule, value) {
  if (value === null || value === undefined || value === "") return true;
  if (rule.type === "list") return rule.values.includes(String(value));
  if (rule.type === "number")
    return (
      numeric(value) &&
      (rule.operator === "any" ||
        conditionMatches(
          { type: rule.operator, value: rule.value, value2: rule.value2 },
          value,
        ))
    );
  if (rule.type === "checkbox")
    return (
      typeof value === "boolean" ||
      ["TRUE", "FALSE"].includes(String(value).toUpperCase())
    );
  if (rule.type === "email")
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
  if (rule.type === "url") {
    try {
      return ["http:", "https:"].includes(new URL(String(value)).protocol);
    } catch {
      return false;
    }
  }
  if (rule.type === "date") {
    if (numeric(value)) return value >= 0 && value < 2958466;
    const text = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const date = new Date(text + "T00:00:00Z");
    return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === text;
  }
  return false;
}
