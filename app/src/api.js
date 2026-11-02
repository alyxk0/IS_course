export async function api(url, options = {}) {
  const response = await fetch(`/api${url}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}
export const colName = (n) => {
  let s = "";
  for (n++; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
export function parseAddress(value) {
  const match = /^([A-Z]+)([1-9]\d*)$/i.exec(value.trim());
  if (!match) return null;
  let col = 0;
  for (const c of match[1].toUpperCase()) col = col * 26 + c.charCodeAt(0) - 64;
  return { row: Number(match[2]) - 1, col: col - 1 };
}
export const address = (r, c) => `${colName(c)}${r + 1}`;
export const roleNames = {
  owner: "Владелец",
  editor: "Редактор",
  commenter: "Комментатор",
  viewer: "Читатель",
};
export function rangeText(range) {
  return `${address(range.r, range.c)}:${address(range.r2, range.c2)}`;
}
export function parseRange(text, sheet) {
  let value = String(text).trim(),
    prefix = "";
  if (value.includes("!")) {
    const index = value.lastIndexOf("!");
    prefix = value.slice(0, index).replace(/^'|'$/g, "").replace(/''/g, "'");
    value = value.slice(index + 1);
    if (prefix !== sheet.name)
      throw new Error("Укажите диапазон текущего листа");
  }
  value = value.replaceAll("$", "");
  let range;
  if (/^[a-z]+:[a-z]+$/i.test(value)) {
    const [a, b] = value.split(":").map((c) => parseAddress(c + "1"));
    range = { r: 0, r2: sheet.rows - 1, c: a.col, c2: b.col };
  } else if (/^\d+:\d+$/.test(value)) {
    const [a, b] = value.split(":").map(Number);
    range = { r: a - 1, r2: b - 1, c: 0, c2: sheet.cols - 1 };
  } else {
    const parts = value.split(":"),
      [a, b] = parts.map(parseAddress);
    if (!a || parts.length > 2 || (parts.length === 2 && !b))
      throw new Error("Укажите диапазон, например A1:C10");
    range = { r: a.row, r2: b?.row ?? a.row, c: a.col, c2: b?.col ?? a.col };
  }
  if (
    range.r < 0 ||
    range.c < 0 ||
    range.r2 < range.r ||
    range.c2 < range.c ||
    range.r2 >= sheet.rows ||
    range.c2 >= sheet.cols
  )
    throw new Error("Диапазон выходит за пределы листа");
  return range;
}
export function parseCSV(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  let separator = ",",
    inQuotes = false;
  // Delimiter detection must inspect a logical record: the first cell can
  // contain quoted line breaks, and quoted tabs are data rather than separators.
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && inQuotes && text[i + 1] === '"') {
      i++;
      continue;
    }
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && c === "\t") {
      separator = "\t";
      break;
    } else if (!inQuotes && (c === "\n" || c === "\r")) break;
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && quoted && text[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (c === '"') quoted = !quoted;
    else if (!quoted && c === separator) {
      row.push(cell);
      cell = "";
    } else if (!quoted && (c === "\n" || c === "\r")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
