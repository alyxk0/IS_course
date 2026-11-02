export const FONT_SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 18, 24, 36];
export const MIN_FONT_SIZE = 1;
export const MAX_FONT_SIZE = 400;
export const validFontSize = (value) => typeof value === "number" && Number.isFinite(value) && value >= MIN_FONT_SIZE && value <= MAX_FONT_SIZE;
export function parseFontSize(input) {
  const text = String(input).trim().replace(",", ".");
  if (!/^[+]?\d+(?:\.\d+)?$/.test(text)) return null;
  const size = Math.trunc(Number(text));
  return size >= MIN_FONT_SIZE && Number.isFinite(size) ? Math.min(MAX_FONT_SIZE, size) : null;
}
export const stepFontSize = (value, direction) => Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.trunc(value || 10) + direction));
