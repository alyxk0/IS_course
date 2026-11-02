import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const cssSource =
  "https://fonts.googleapis.com/css2?family=Google+Sans:opsz,wght@18,400..700&display=swap";
const licenseSource =
  "https://raw.githubusercontent.com/googlefonts/googlesans/10c1a0fd02fa1f6d0479480668546e81ab84b3b3/OFL.txt";
const subsets = new Set([
  "cyrillic-ext",
  "cyrillic",
  "greek-ext",
  "greek",
  "vietnamese",
  "latin-ext",
  "latin",
]);
// These are the exact variable faces loaded by the current Sheets interface.
const sheetFaces = {
  latin:
    "https://fonts.gstatic.com/s/googlesans/v29/4UaGrENHsxJlGDuGo1OIlL3Owp4.woff2",
  cyrillic:
    "https://fonts.gstatic.com/s/googlesans/v29/4UaGrENHsxJlGDuGo1OIlL3Kwp5MKg.woff2",
};
const response = await fetch(cssSource, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  },
});
if (!response.ok) throw new Error(`Font CSS: HTTP ${response.status}`);
const css = await response.text(),
  selected = [];
for (const match of css.matchAll(
  /\/\* ([a-z-]+) \*\/\s*(@font-face\s*\{[^}]+\})/g,
)) {
  if (!subsets.has(match[1])) continue;
  const url = match[2].match(/url\((https:[^)]+\.woff2)\)/)?.[1];
  if (!url?.startsWith("https://fonts.gstatic.com/s/googlesans/v71/"))
    throw new Error("Upstream font version changed; review before updating.");
  const source = sheetFaces[match[1]] || url;
  selected.push({
    subset: match[1],
    source,
    rule: match[2].replace(url, source),
  });
}
if (selected.length !== subsets.size) throw new Error("Missing font subset");
const licenseResponse = await fetch(licenseSource);
if (!licenseResponse.ok)
  throw new Error(`Font license: HTTP ${licenseResponse.status}`);
const license = await licenseResponse.text();
if (!license.includes("SIL OPEN FONT LICENSE"))
  throw new Error("Unexpected font license");
await mkdir("src/assets/fonts", { recursive: true });
await mkdir("licenses", { recursive: true });
const files = await Promise.all(
  selected.map(async ({ subset, source, rule }) => {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`${subset}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.toString("ascii", 0, 4) !== "wOF2")
      throw new Error(`Invalid WOFF2: ${subset}`);
    const file = `google-sans-${subset}.woff2`;
    await writeFile(`src/assets/fonts/${file}`, bytes);
    return {
      subset,
      source,
      file,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      css: `/* ${subset} */\n${rule.replace(source, `./fonts/${file}`)}`,
    };
  }),
);
await writeFile(
  "src/assets/ui-font.css",
  files.map((f) => f.css).join("\n") + "\n",
);
await writeFile(
  "src/assets/fonts/sources.json",
  JSON.stringify(
    { cssSource, licenseSource, files: files.map(({ css, ...file }) => file) },
    null,
    2,
  ) + "\n",
);
await writeFile("licenses/google-sans-OFL.txt", license);
await writeFile(
  "licenses/google-sans-NOTICE.md",
  "# Google Sans\n\nLocally hosted Google Sans, normal style, variable weights 400–700. The Latin and Cyrillic v29 faces match the files loaded by Google Sheets on 2026-10-19 and include the optical-size axis 17–18. Other subsets use v71 at optical size 18.\n\n" +
    "Source: https://github.com/googlefonts/googlesans\n\n" +
    "License: SIL Open Font License 1.1, included in google-sans-OFL.txt.\n\n" +
    "The selected WOFF2 files are unmodified. Sources and SHA-256 digests: src/assets/fonts/sources.json.\n\n" +
    "Update: node scripts/update-ui-fonts.mjs. The script requires review if the upstream font version changes.\n",
);
console.log(
  `Stored ${files.length} Google Sans subsets and their OFL license.`,
);
