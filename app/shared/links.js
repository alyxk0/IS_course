export function safeLink(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 2048 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
    if (url.protocol === "mailto:" && !url.pathname) return null;
    if (url.href.length > 2048) return null;
    return url.href;
  } catch {
    return null;
  }
}

export const validRotation = (value) =>
  value === "vertical" ||
  (Number.isInteger(value) && value >= -90 && value <= 90);
