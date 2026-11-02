import { format, formatColor, getFormatInfo, isValidFormat, tokenize } from "numfmt";

export const MAX_DECIMAL_PLACES = 30;
export const NUMBER_FORMATS = ["auto", "text", "number", "currency", "percent", "scientific", "accounting", "financial", "currencyRounded", "date", "time", "datetime", "duration", "custom"];
export const validNumberPattern = (pattern) =>
  typeof pattern === "string" && pattern.length > 0 && pattern.length <= 200 &&
  !/[\u0000-\u001f\u007f]/.test(pattern) && isValidFormat(pattern);
export const NUMBER_FORMAT_OPTIONS = { locale: "ru", leap1900: false, throws: false };
const currencySymbols = new Map();
function currencySymbol(code = "RUB") {
  if (!currencySymbols.has(code)) {
    if (currencySymbols.size >= 64) currencySymbols.delete(currencySymbols.keys().next().value);
    currencySymbols.set(code, new Intl.NumberFormat("ru-RU", { style: "currency", currency: code }).formatToParts(0).find((p) => p.type === "currency").value);
  }
  return currencySymbols.get(code);
}

export function formatPattern(style = {}) {
  if (style.format === "custom") return validNumberPattern(style.numberPattern) ? style.numberPattern : null;
  const simple = { text: "@", date: "dd.mm.yyyy", time: "h:mm:ss", datetime: "dd.mm.yyyy h:mm:ss", duration: "[h]:mm:ss" };
  if (simple[style.format]) return simple[style.format];
  if (!["scientific", "financial", "accounting", "currencyRounded"].includes(style.format)) return null;
  const places = validDecimalPlaces(style.decimalPlaces) ? style.decimalPlaces : style.format === "currencyRounded" ? 0 : 2,
    digits = "#,##0" + (places ? "." + "0".repeat(places) : ""),
    symbol = ["accounting", "currencyRounded"].includes(style.format) ? currencySymbol(style.currency) : "";
  switch (style.format) {
    case "scientific": return "0" + (places ? "." + "0".repeat(places) : "") + "E+00";
    case "financial": return `${digits};(${digits});"-"`;
    case "accounting": return `${digits} "${symbol}";(${digits}) "${symbol}";"-" "${symbol}"`;
    case "currencyRounded": return `${digits} "${symbol}"`;
    default: return null;
  }
}

export function formatWithPattern(value, pattern) {
  return format(pattern, value, NUMBER_FORMAT_OPTIONS);
}

export function numberFormatColor(value, style) {
  if (style?.format !== "custom" || !validNumberPattern(style.numberPattern)) return undefined;
  return formatColor(style.numberPattern, value, { throws: false });
}

// Operate on parsed tokens so quoted dots, dates, conditions and exponent
// digits do not accidentally become decimal placeholders.
export function withNumberPrecision(style, places) {
  if (style.format !== "custom" || !validNumberPattern(style.numberPattern))
    return { ...style, format: ["currency", "percent", "number", "scientific", "financial", "accounting", "currencyRounded"].includes(style.format) ? style.format : "number", decimalPlaces: places };
  const info = getFormatInfo(style.numberPattern);
  if (info.isDate || info.type === "fraction" || info.isText)
    return { ...style, format: "number", decimalPlaces: places, numberPattern: undefined };
  const sections = [[]];
  for (const token of tokenize(style.numberPattern)) {
    if (token.type === "BREAK") sections.push([]);
    else sections.at(-1).push(token);
  }
  const numberPattern = sections.map((tokens) => {
    const decimal = tokens.findIndex((t) => t.type === "POINT");
    const digits = (t) => t && ["ZERO", "HASH", "QMARK"].includes(t.type);
    const endOfMantissa = tokens.findIndex((t) => t.type === "EXP");
    const limit = endOfMantissa < 0 ? tokens.length : endOfMantissa;
    let end = decimal;
    if (decimal >= 0) {
      end++;
      while (digits(tokens[end])) end++;
      tokens.splice(decimal, end - decimal, { raw: places ? "." + "0".repeat(places) : "" });
    } else {
      let last = -1;
      for (let i = 0; i < limit; i++) if (digits(tokens[i])) last = i;
      if (last >= 0 && places) tokens.splice(last + 1, 0, { raw: "." + "0".repeat(places) });
    }
    return tokens.map((t) => t.raw).join("");
  }).join(";");
  return { ...style, numberPattern, decimalPlaces: places };
}
export const validDecimalPlaces = (value) =>
  Number.isInteger(value) && value >= 0 && value <= MAX_DECIMAL_PLACES;

export function numberOptions(style = {}) {
  const options =
    style.format === "currency"
      ? { style: "currency", currency: style.currency || "RUB" }
      : style.format === "percent"
        ? { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  if (validDecimalPlaces(style.decimalPlaces)) {
    options.minimumFractionDigits = style.decimalPlaces;
    options.maximumFractionDigits = style.decimalPlaces;
  }
  return options;
}

export function displayedDecimalPlaces(value, style = {}) {
  if (validDecimalPlaces(style.decimalPlaces)) return style.decimalPlaces;
  const pattern = formatPattern(style);
  if (pattern) return Math.min(MAX_DECIMAL_PLACES, getFormatInfo(pattern).maxDecimals || 0);
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (["currency", "percent", "number"].includes(style.format))
    return (
      new Intl.NumberFormat("ru-RU", numberOptions(style))
        .formatToParts(value)
        .find((part) => part.type === "fraction")?.value.length || 0
    );
  const [coefficient, exponent = "0"] = Math.abs(value).toString().split("e");
  return Math.min(
    MAX_DECIMAL_PLACES,
    Math.max(0, (coefficient.split(".")[1]?.length || 0) - Number(exponent)),
  );
}

export function excelNumberFormat(style = {}) {
  const pattern = formatPattern(style);
  if (pattern) return pattern;
  const fixed = validDecimalPlaces(style.decimalPlaces),
    places = fixed
      ? style.decimalPlaces
      : style.format === "currency"
        ? 2
        : ["number", "percent"].includes(style.format) ? 2 : null,
    fraction = places === null ? ".##" : places ? "." + "0".repeat(places) : "";
  if (style.format === "currency") {
    const symbol = currencySymbol(style.currency);
    return "#,##0" + fraction + ` "${symbol}"`;
  }
  if (style.format === "percent") return "0" + fraction + "%";
  if (style.format === "number" || fixed) return "#,##0" + fraction;
  return null;
}

export function readNumberFormat(format) {
  if (!format || format === "General") return null;
  if (format === "@") return { format: "text" };
  const match = /^(?:#,##)?0(?:\.([0#]+))?(%)?( "₽")?$/.exec(format || "");
  if (!match || (match[2] && match[3]))
    return validNumberPattern(format) ? { format: "custom", numberPattern: format } : null;
  const fraction = match[1] || "",
    style = { format: match[2] ? "percent" : match[3] ? "currency" : "number" };
  if (/^0*$/.test(fraction) && fraction.length <= MAX_DECIMAL_PLACES)
    style.decimalPlaces = fraction.length;
  else return validNumberPattern(format) ? { format: "custom", numberPattern: format } : null;
  return style;
}
