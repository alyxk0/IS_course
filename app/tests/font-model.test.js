import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { DEFAULT_FONTS, FONT_NAMES, FONT_CATALOG, fontChoices, filterFonts, normalizeFontPreferences, rememberFont, fontPreferenceKey } from "../src/fontModel.js";
test("font choices retain current imported or peer fonts, deduplicate preferences and filter by script/category", () => {
  assert.equal(DEFAULT_FONTS.length, 25);
  assert.equal(new Set(FONT_NAMES).size, 36);
  assert.deepEqual(normalizeFontPreferences({ enabled: ["Open Sans", "bad", "Open Sans"], recent: "bad" }), { enabled: ["Open Sans"], recent: [] });
  assert(fontChoices({ enabled: [], recent: [] }, "Open Sans").includes("Open Sans"));
  assert(fontChoices(null, "Calibri").includes("Calibri"));
  assert.equal(rememberFont({ enabled: [], recent: ["Arial", "Montserrat"] }, "Montserrat").recent[0], "Montserrat");
  assert.notEqual(fontPreferenceKey("owner"), fontPreferenceKey("viewer"));
  assert.deepEqual(filterFonts("ROBOTO MONO", "cyrillic", "MONOSPACE", "alpha").map((font) => font.name), ["Roboto Mono"]);
  assert.equal(filterFonts("Poppins", "cyrillic", "", "popular").length, 0);
  assert.equal(filterFonts("", "", "", "popular")[0].name, "Roboto");
  assert.equal(FONT_CATALOG.find((font) => font.name === "Georgia").category, "SERIF");
});
test("bundled font sources match hashes and font signatures, and licenses cover every downloaded family", async () => {
  const manifest = JSON.parse(await readFile(new URL("../src/assets/sheet-fonts/sources.json", import.meta.url), "utf8"));
  assert.equal(manifest.families.length, 27);
  assert.match(manifest.revision, /^[a-f0-9]{40}$/);
  for (const family of manifest.families) {
    const license = await readFile(new URL(`../licenses/sheet-fonts/${family.slug}-OFL.txt`, import.meta.url), "utf8");
    assert.match(license, /SIL OPEN FONT LICENSE/);
    assert(family.files.some((file) => file.subset === "latin"));
    for (const file of family.files) {
      const bytes = await readFile(new URL(`../src/assets/sheet-fonts/${file.file}`, import.meta.url));
      assert.equal(bytes.toString("ascii", 0, 4), "wOF2");
      assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
      assert(file.source.startsWith("https://fonts.gstatic.com/"));
    }
  }
});
