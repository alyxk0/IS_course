import { numberOptions, validDecimalPlaces, formatPattern, formatWithPattern } from "../shared/numberFormats.js";
export function formatValue(value, style = {}) {
  if (value == null) return "";
  const pattern = formatPattern(style);
  if (pattern) return formatWithPattern(value, pattern);
  if (typeof value === "number") {
    if (
      ["currency", "percent", "number"].includes(style.format) ||
      validDecimalPlaces(style.decimalPlaces)
    )
      return new Intl.NumberFormat("ru-RU", numberOptions(style)).format(value);
  }
  return String(value);
}
