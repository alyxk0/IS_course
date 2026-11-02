import { safeLink } from "../shared/links.js";
import { normalizeBanding } from "../shared/banding.js";
import { namedRangeAddress } from "../shared/namedRanges.js";

const escapeXML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const decodeXML = (value) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (all, entity) => {
    if (entity[0] === "#") {
      const n =
        entity[1].toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : Number(entity.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[entity] || all;
  });
const attrs = (text) =>
  Object.fromEntries(
    [...text.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [
      m[1],
      decodeXML(m[2] ?? m[3]),
    ]),
  );
const tags = (xml, name) =>
  [
    ...xml.matchAll(new RegExp(`<(?:[\\w.-]+:)?${name}\\b([^>]*?)/?>`, "g")),
  ].map((m) => attrs(m[1]));
const resolve = (base, target) => {
  const parts = [];
  for (const p of (base + target).replaceAll("\\", "/").split("/")) {
    if (p === "..") parts.pop();
    else if (p && p !== ".") parts.push(p);
  }
  return parts.join("/");
};
async function read(zip, path) {
  const file = zip.file(path);
  if (!file) return "";
  if (file._data?.uncompressedSize > 20 * 1024 * 1024)
    throw new Error("Лист после распаковки превышает 20 МБ");
  const text = await file.async("string");
  if (text.length > 20 * 1024 * 1024)
    throw new Error("Лист после распаковки превышает 20 МБ");
  return text;
}

// Native OOXML hyperlinks are separate from values. ExcelJS otherwise coerces
// a formula/number with a link to its Hyperlink value type during reconciliation.
function addClipMetadata(xml, cells, bandings = []) {
  if (!cells.length && !bandings.length) return xml;
  const extension = (cells.length ? '<ext uri="{14973C6C-7A5E-4EB2-AFC5-7C216D036535}"><os:clippedCells xmlns:os="urn:open-sheets:wrapping:v1">' +
    cells.map(([key]) => { const [r, c] = key.split(","); return `<os:clipCell r="${r}" c="${c}"/>`; }).join("") + '</os:clippedCells></ext>' : "") +
    (bandings.length ? '<ext uri="{94392B1B-6C39-4EF5-AEC5-81F6D1DF31F8}"><os:bandedRanges xmlns:os="urn:open-sheets:banding:v1">' + bandings.map((rule) => `<os:band ${Object.entries({ ...rule.range, header: rule.header || "", first: rule.first, second: rule.second, footer: rule.footer || "" }).map(([key, value]) => `${key}="${escapeXML(value)}"`).join(" ")}/>`).join("") + '</os:bandedRanges></ext>' : "");
  if (/<\/(?:[\w.-]+:)?extLst\s*>/.test(xml))
    return xml.replace(/<\/(?:[\w.-]+:)?extLst\s*>/, (close) => extension + close);
  return xml.replace("</worksheet>", `<extLst>${extension}</extLst></worksheet>`);
}
export async function addWorkbookLinks(buffer, sheets, namedRanges = [], allSheets = []) {
  if (!namedRanges.length && !sheets.some((s) => s.bandedRanges?.length || Object.values(s.cells).some((c) => c.link || c.style?.wrapMode === "clip")))
    return buffer;
  const { default: JSZip } = await import("jszip"),
    zip = await JSZip.loadAsync(buffer);
  for (const sheet of sheets) {
    const links = Object.entries(sheet.cells).filter(([, c]) =>
      safeLink(c.link),
    );
    const clipped = Object.entries(sheet.cells).filter(([, c]) => c.style?.wrapMode === "clip");
    if (!links.length && !clipped.length && !sheet.bandedRanges?.length) continue;
    const part = `xl/worksheets/sheet${sheet.id}.xml`,
      relPart = `xl/worksheets/_rels/sheet${sheet.id}.xml.rels`;
    let xml = await read(zip, part),
      rels = await read(zip, relPart);
    if (!xml) throw new Error("Не найден лист для экспорта ссылок");
    if (!links.length) {
      zip.file(part, addClipMetadata(xml, clipped, sheet.bandedRanges));
      continue;
    }
    if (!rels)
      rels =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    const ids = new Set(tags(rels, "Relationship").map((r) => r.Id)),
      nodes = [],
      relationships = [];
    let next = 1;
    for (const [key, cell] of links) {
      const [r, c] = key.split(",").map(Number);
      let col = "",
        number = c + 1;
      while (number) {
        col = String.fromCharCode(65 + ((number - 1) % 26)) + col;
        number = Math.floor((number - 1) / 26);
      }
      let id;
      do {
        id = `rIdSheetLink${next++}`;
      } while (ids.has(id));
      ids.add(id);
      nodes.push(`<hyperlink ref="${col}${r + 1}" r:id="${id}"/>`);
      relationships.push(
        `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXML(safeLink(cell.link))}" TargetMode="External"/>`,
      );
    }
    const block = `<hyperlinks>${nodes.join("")}</hyperlinks>`;
    const index = xml.search(
      /<(?:\w+:)?(?:printOptions|pageMargins|pageSetup|headerFooter|rowBreaks|colBreaks|drawing|legacyDrawing|extLst)\b/,
    );
    if (index >= 0) xml = xml.slice(0, index) + block + xml.slice(index);
    else xml = xml.replace("</worksheet>", block + "</worksheet>");
    if (!xml.includes("xmlns:r="))
      xml = xml.replace(
        "<worksheet ",
        '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ',
      );
    rels = rels.replace(
      /<\/Relationships\s*>/,
      relationships.join("") + "</Relationships>",
    );
    zip.file(part, addClipMetadata(xml, clipped, sheet.bandedRanges));
    zip.file(relPart, rels);
  }
  if (namedRanges.length) {
    let xml = await read(zip, "xl/workbook.xml");
    const block = namedRanges.map(item => `<definedName name="${escapeXML(item.name)}"${item.scopeSheetId?` localSheetId="${sheets.find(s=>s.sheetId===item.scopeSheetId)?.workbookIndex??allSheets.findIndex(s=>s.id===item.scopeSheetId)}"`:""}>${escapeXML(namedRangeAddress(item, allSheets, true))}</definedName>`).join("");
    if (/<\/(?:[\w.-]+:)?definedNames\s*>/.test(xml)) xml = xml.replace(/<\/(?:[\w.-]+:)?definedNames\s*>/, close => block + close);
    else xml = xml.replace(/<(?:[\w.-]+:)?(?:calcPr|extLst)\b|<\/(?:[\w.-]+:)?workbook\s*>/, match => `<definedNames>${block}</definedNames>` + match);
    zip.file("xl/workbook.xml", xml);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export async function extractWorkbookLinks(buffer) {
  const { default: JSZip } = await import("jszip"),
    zip = await JSZip.loadAsync(buffer);
  const workbook = await read(zip, "xl/workbook.xml"),
    first = tags(workbook, "sheet")[0];
  const namedRanges = [...workbook.matchAll(/<(?:[\w.-]+:)?definedName\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?definedName\s*>/g)].map(match => ({ ...tags(`<definedName ${match[1]}/>`, "definedName")[0], address: decodeXML(match[2]) })).filter(item => item.localSheetId === undefined || item.localSheetId === "0");
  if (namedRanges.length > 10000) throw new Error("Слишком много именованных диапазонов");
  const rels = tags(
    await read(zip, "xl/_rels/workbook.xml.rels"),
    "Relationship",
  );
  const id =
    first?.["r:id"] ||
    Object.entries(first || {}).find(([k]) => k.endsWith(":id"))?.[1];
  const target = rels.find((r) => r.Id === id)?.Target;
  const part = target
    ? resolve(target.startsWith("/") ? "" : "xl/", target)
    : "xl/worksheets/sheet1.xml";
  const xml = await read(zip, part),
    nodes = tags(xml, "hyperlink");
  const clipped = new Set();
  const bandedRanges = tags(xml, "band").map((node) => normalizeBanding({ range: Object.fromEntries(["r", "r2", "c", "c2"].map((key) => [key, Number(node[key])])), header: node.header || null, first: node.first, second: node.second, footer: node.footer || null }));
  if (bandedRanges.length > 100) throw new Error("Слишком много диапазонов чередования цветов");
  for (const cell of tags(xml, "clipCell")) {
    const r = Number(cell.r), c = Number(cell.c);
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= 10000 || c >= 200) continue;
    clipped.add(`${r},${c}`);
    if (clipped.size > 20000) throw new Error("Слишком много форматов обрезки текста");
  }
  if (!nodes.length) return { buffer, links: new Map(), clipped, bandedRanges, namedRanges };
  const slash = part.lastIndexOf("/"),
    relPart =
      part.slice(0, slash) + "/_rels/" + part.slice(slash + 1) + ".rels";
  const linkRels = new Map(
    tags(await read(zip, relPart), "Relationship").map((r) => [r.Id, r.Target]),
  );
  const links = new Map();
  for (const node of nodes) {
    const link = safeLink(linkRels.get(node["r:id"]));
    if (!link) continue;
    const match =
      /^([A-Z]{1,3})([1-9]\d{0,4})(?::([A-Z]{1,3})([1-9]\d{0,4}))?$/.exec(
        node.ref || "",
      );
    if (!match) continue;
    const col = (s) =>
      [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
    const r = Number(match[2]) - 1,
      c = col(match[1]),
      r2 = Number(match[4] || match[2]) - 1,
      c2 = col(match[3] || match[1]);
    if (
      r2 >= 10000 ||
      c2 >= 200 ||
      r2 < r ||
      c2 < c ||
      (r2 - r + 1) * (c2 - c + 1) > 20000
    )
      throw new Error("Диапазон ссылки превышает лимит импорта");
    for (let row = r; row <= r2; row++)
      for (let column = c; column <= c2; column++) {
        links.set(`${row},${column}`, link);
        if (links.size > 20000) throw new Error("Слишком много ссылок");
      }
  }
  zip.file(
    part,
    xml.replace(
      /<(?:[\w.-]+:)?hyperlinks\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?hyperlinks\s*>/g,
      "",
    ),
  );
  return {
    buffer: await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
    }),
    links,
    clipped,
    bandedRanges,
    namedRanges,
  };
}
