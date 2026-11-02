import { build } from "esbuild";
import { readFile, readdir, mkdir, writeFile, cp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
const root = process.cwd(),
  dist = resolve(root, "dist"),
  assets = {};
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "server" || entry.name === ".openai") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path);
    else {
      const bytes = await readFile(path),
        name = "/" + path.slice(dist.length + 1).replaceAll("\\", "/"),
        ext = name.slice(name.lastIndexOf(".")),
        base64 = ![".html", ".js", ".css", ".svg", ".json"].includes(ext);
      assets[name] = {
        type: types[ext] || "application/octet-stream",
        body: bytes.toString(base64 ? "base64" : "utf8"),
        base64,
        etag: '"' + createHash("sha256").update(bytes).digest("hex") + '"',
      };
    }
  }
}
await collect(dist);
await mkdir(join(dist, "server"), { recursive: true });
await build({
  entryPoints: [join(root, "worker/index.js")],
  outfile: join(dist, "server/index.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { crypto: join(root, "worker/crypto-shim.js") },
  plugins: [
    {
      name: "sheet-assets",
      setup(builder) {
        builder.onResolve({ filter: /^virtual:sheet-assets$/ }, () => ({
          path: "sheet-assets",
          namespace: "sheet-assets",
        }));
        builder.onLoad({ filter: /.*/, namespace: "sheet-assets" }, () => ({
          contents: "export default " + JSON.stringify(assets),
          loader: "js",
        }));
      },
    },
  ],
});
await mkdir(join(dist, ".openai"), { recursive: true });
await cp(
  join(root, ".openai/hosting.json"),
  join(dist, ".openai/hosting.json"),
);
await cp(join(root, "drizzle"), join(dist, ".openai/drizzle"), {
  recursive: true,
});
const config = JSON.parse(await readFile(join(root, "wrangler.json"), "utf8"));
config.main = "index.js";
config.d1_databases[0].migrations_dir = "../.openai/drizzle";
await writeFile(
  join(dist, "server/wrangler.json"),
  JSON.stringify(config, null, 2) + "\n",
);
console.log(`Worker built with ${Object.keys(assets).length} embedded assets.`);
