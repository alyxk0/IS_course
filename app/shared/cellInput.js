// Keep literal text separate from its visual format: changing the format of an
// existing formula must not turn the formula into text. New text-formatted input
// is escaped only at the formula-engine boundary, never in the stored value.
export function formulaInput(cell) {
  const raw = cell.value;
  if (cell.literal) return "'" + (raw || "");
  if (!raw || raw.startsWith("=") || raw.startsWith("'")) return raw;
  const pattern = formatPattern(cell.style);
  if (!pattern || !getFormatInfo(pattern).isDate) return raw;
  if (/\[[hms]+\]/i.test(pattern)) {
    const match = /^(-?)(\d+):([0-5]\d)(?::([0-5]\d(?:\.\d+)?))?$/.exec(raw.trim());
    if (!match) return raw;
    const value = (Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] || 0)) / 86400 * (match[1] ? -1 : 1);
    return Number.isFinite(value) ? value : raw;
  }
  const timeOnly = getFormatInfo(pattern).type === "time";
  const parsed = (timeOnly ? parseTime : parseDate)(raw, { locale: "ru", mode: 1 });
  if (!parsed) return raw;
  const value = parsed.value;
  // numfmt's input parser follows Excel's fictitious 1900-02-29. Sheets
  // starts at 1899-12-30 and does not include that fictitious day.
  return timeOnly || value >= 61 ? value : value < 60 ? value + 1 : raw;
}
export function applyLiteralInput(next, patch) {
  if ("literal" in patch) next.literal = patch.literal;
  else if ("value" in patch) {
    if (next.style?.format === "text") next.literal = true;
    else delete next.literal;
  }
  return next;
}
import { getFormatInfo, parseDate, parseTime } from "numfmt";
import { formatPattern } from "./numberFormats.js";

