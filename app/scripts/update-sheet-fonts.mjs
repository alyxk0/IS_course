import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const defaults = ["Amatic SC", "Arial", "Caveat", "Comfortaa", "Comic Sans MS", "Courier New", "EB Garamond", "Georgia", "Impact", "Lexend", "Lobster", "Lora", "Merriweather", "Montserrat", "Nunito", "Oswald", "Pacifico", "Playfair Display", "Roboto", "Roboto Mono", "Roboto Serif", "Spectral", "Times New Roman", "Trebuchet MS", "Verdana"];
const system = new Set(["Arial", "Comic Sans MS", "Courier New", "Georgia", "Impact", "Times New Roman", "Trebuchet MS", "Verdana"]);
const extra = ["Open Sans", "Lato", "PT Sans", "PT Serif", "Source Sans 3", "Noto Sans", "Raleway", "Inconsolata", "Inter", "Poppins"];
const subsets = new Set(["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese"]);
const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36" };
async function get(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}
const revision = (await (await get("https://api.github.com/repos/google/fonts/commits/main")).json()).sha;
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Invalid font source revision");
await mkdir("src/assets/sheet-fonts", { recursive: true });
await mkdir("licenses/sheet-fonts", { recursive: true });
const results = [], queue = [...defaults.filter((name) => !system.has(name)), ...extra];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const name = queue.shift(), slug = name.toLowerCase().replaceAll(" ", ""), base = `https://raw.githubusercontent.com/google/fonts/${revision}/ofl/${slug}/`;
    const metadata = await (await get(base + "METADATA.pb")).text();
    const license = await (await get(base + "OFL.txt")).text();
    if (!license.includes("SIL OPEN FONT LICENSE")) throw new Error(`Review license for ${name}`);
    const faces = [...metadata.matchAll(/fonts\s*\{([\s\S]*?)\n\}/g)].map((m) => ({ style: m[1].match(/style:\s*"([^"]+)"/)?.[1], weight: Number(m[1].match(/weight:\s*(\d+)/)?.[1]) }));
    const weightAxis = metadata.match(/tag:\s*"wght"\s*min_value:\s*([\d.]+)\s*max_value:\s*([\d.]+)/), variable = weightAxis && +weightAxis[1] <= 400 && +weightAxis[2] >= 700;
    const italic = faces.some((face) => face.style === "italic");
    const tuples = (italic ? ["normal", "italic"] : ["normal"]).flatMap((style, index) => {
      const weights = variable ? ["400..700"] : [400, 700].filter((weight) => faces.some((face) => face.style === style && face.weight === weight));
      return weights.map((weight) => `${italic ? index + "," : ""}${weight}`);
    });
    if (!tuples.length) throw new Error(`No regular style for ${name}`);
    const cssSource = `https://fonts.googleapis.com/css2?family=${name.replaceAll(" ", "+")}:${italic ? "ital," : ""}wght@${tuples.join(";")}&display=swap`;
    const css = await (await get(cssSource, { headers })).text(), rules = [], files = [], urls = new Map();
    for (const match of css.matchAll(/\/\* ([a-z-]+) \*\/\s*(@font-face\s*\{[^}]+\})/g)) {
      if (!subsets.has(match[1])) continue;
      const source = match[2].match(/url\((https:[^)]+\.woff2)\)/)?.[1];
      if (!source?.startsWith("https://fonts.gstatic.com/")) throw new Error(`Unexpected font source for ${name}`);
      let file = urls.get(source);
      if (!file) {
        file = `${slug}-${files.length}.woff2`;
        const bytes = Buffer.from(await (await get(source)).arrayBuffer());
        if (bytes.toString("ascii", 0, 4) !== "wOF2") throw new Error(`Invalid font bytes for ${name}`);
        await writeFile(`src/assets/sheet-fonts/${file}`, bytes);
        files.push({ file, subset: match[1], source, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
        urls.set(source, file);
      }
      rules.push(`/* ${name}: ${match[1]} */\n` + match[2].replace(source, `./sheet-fonts/${file}`));
    }
    if (!files.some((file) => file.subset === "latin")) throw new Error(`Missing Latin face for ${name}`);
    await writeFile(`licenses/sheet-fonts/${slug}-OFL.txt`, license);
    results.push({ name, slug, cssSource, licenseSource: base + "OFL.txt", metadataSource: base + "METADATA.pb", category: metadata.match(/category:\s*"([^"]+)"/)?.[1] || "SANS_SERIF", variable: !!variable, italic, files, rules });
    console.log(`${name}: ${files.length} files`);
  }
}));
results.sort((a, b) => a.name.localeCompare(b.name, "en"));
await writeFile("src/assets/sheet-fonts.css", results.flatMap((item) => item.rules).join("\n") + "\n");
await writeFile("src/assets/sheet-fonts/sources.json", JSON.stringify({ revision, families: results.map(({ rules, ...entry }) => entry) }, null, 2) + "\n");
await writeFile("src/assets/font-catalog.json", JSON.stringify({ defaults, extra: ["Google Sans", ...extra], system: [...system], families: results.map((item) => ({ name: item.name, category: item.category, cyrillic: item.files.some((file) => file.subset === "cyrillic"), latin: true })) }, null, 2) + "\n");
await writeFile("licenses/sheet-fonts-NOTICE.md", "# Spreadsheet fonts\n\nUnmodified WOFF2 subsets from Google Fonts, locally hosted. Each family uses SIL Open Font License 1.1; individual notices and copyright statements are in sheet-fonts/. No proprietary system font is bundled.\n\nSource: https://github.com/google/fonts/tree/" + revision + "\n\nSources, selected styles, subsets and SHA-256 digests: src/assets/sheet-fonts/sources.json.\n\nUpdate: node scripts/update-sheet-fonts.mjs. Review generated font assets and metadata when updating.\n");
console.log(`Stored ${results.length} families, ${results.reduce((sum, item) => sum + item.files.reduce((n, file) => n + file.bytes, 0), 0)} bytes.`);
