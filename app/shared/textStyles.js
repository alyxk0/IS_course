export function textDecoration(style = {}, link = null) {
  return [(style.underline ?? !!link) ? "underline" : "", style.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none";
}
