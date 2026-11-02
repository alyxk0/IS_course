import catalog from "./assets/font-catalog.json" with { type: "json" };
export const DEFAULT_FONTS = catalog.defaults;
export const FONT_NAMES = [...DEFAULT_FONTS, ...catalog.extra];
const systemCategory = { "Comic Sans MS": "HANDWRITING", "Courier New": "MONOSPACE", Georgia: "SERIF", Impact: "DISPLAY", "Times New Roman": "SERIF" };
export const FONT_CATALOG = FONT_NAMES.map((name) => ({ name, category: systemCategory[name] || "SANS_SERIF", latin: true, cyrillic: true, ...catalog.families.find((family) => family.name === name) }));
const unique = (values) => [...new Set((Array.isArray(values) ? values : []).filter((value) => FONT_NAMES.includes(value)))];
export function normalizeFontPreferences(value) {
  return { enabled: unique(value?.enabled), recent: unique(value?.recent).slice(0, 5) };
}
export function fontPreferenceKey(userId) { return `open-sheets.fonts.${encodeURIComponent(userId)}`; }
export function readFontPreferences(userId) {
  try { return normalizeFontPreferences(JSON.parse(localStorage.getItem(fontPreferenceKey(userId)) || "null")); }
  catch { return normalizeFontPreferences(null); }
}
export function fontChoices(preferences, current) {
  return [...new Set([...DEFAULT_FONTS, ...normalizeFontPreferences(preferences).enabled, ...(current ? [current] : [])])].sort((a, b) => a.localeCompare(b, "en"));
}
export function rememberFont(preferences, name) {
  return normalizeFontPreferences({ ...preferences, recent: [name, ...(preferences.recent || []).filter((font) => font !== name)] });
}
export function filterFonts(query, script, category, sort) {
  const popular = ["Roboto", "Open Sans", "Google Sans", "Montserrat", "Inter", "Poppins", "Lato", "Noto Sans", "Roboto Mono", "Oswald", "Raleway"];
  return FONT_CATALOG.filter((font) => font.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (!script || font[script]) && (!category || font.category === category)).sort((a, b) => {
    if (sort === "popular") {
      const rank = (font) => popular.includes(font.name) ? popular.indexOf(font.name) : popular.length;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
    }
    return a.name.localeCompare(b.name, "en");
  });
}
