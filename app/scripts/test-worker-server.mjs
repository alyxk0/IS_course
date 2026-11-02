import { spawn } from "node:child_process";
import { resolve } from "node:path";
let active;
const env = {
  ...process.env,
  CLOUDFLARE_CF_FETCH_ENABLED: "false",
  WRANGLER_SEND_METRICS: "false",
};
const cli = resolve("node_modules/wrangler/bin/wrangler.js");
const run = (args) =>
  new Promise((done, reject) => {
    active = spawn(process.execPath, [cli, ...args], { env, stdio: "inherit" });
    active.once("error", reject);
    active.once("exit", (code, signal) =>
      code === 0 || signal
        ? done()
        : reject(new Error(`Wrangler exited ${code}`)),
    );
  });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => active?.kill(signal));
try {
  await run([
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    "wrangler.json",
    "--persist-to",
    ".wrangler/tests",
  ]);
  await run([
    "dev",
    "--config",
    "wrangler.json",
    "--ip",
    "127.0.0.1",
    "--port",
    "3103",
    "--persist-to",
    ".wrangler/tests",
  ]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
