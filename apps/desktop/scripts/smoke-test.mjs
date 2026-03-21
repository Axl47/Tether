import { once } from "node:events";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(__dirname, "..");
const electronBin = resolve(desktopDir, "node_modules/.bin/electron");
const mainJs = resolve(desktopDir, "dist-electron/main.js");

console.log("\nLaunching Electron smoke test...");

const server = createServer((_request, response) => {
  const url = new URL(_request.url ?? "/", "http://127.0.0.1");
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  if (url.pathname === "/app") {
    response.end(`<!doctype html>
<html lang="en">
  <body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#020617;color:#e2e8f0;font:600 18px/1.5 system-ui;">
    <div>Desktop browser composition smoke host</div>
  </body>
</html>`);
    return;
  }

  response.end(`<!doctype html>
<html lang="en">
  <body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0f172a;color:#f8fafc;font:700 42px/1.2 system-ui;">
    <div>Tether Browser Smoke</div>
  </body>
</html>`);
});

server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Unable to resolve smoke test server address.");
}
const appUrl = `http://127.0.0.1:${address.port}/app`;
const probeUrl = `http://127.0.0.1:${address.port}/probe`;

const child = spawn(electronBin, [mainJs], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: appUrl,
    ELECTRON_ENABLE_LOGGING: "1",
    TETHER_BROWSER_COMPOSITION_PROBE_URL: probeUrl,
  },
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

let finalized = false;
const finalize = (exitCode) => {
  if (finalized) return;
  finalized = true;
  clearTimeout(timeout);
  server.close();
  process.exit(exitCode);
};

const failNow = (message) => {
  console.error("\nDesktop smoke test failed:");
  console.error(` - ${message}`);
  if (output.trim().length > 0) {
    console.error("\nFull output:\n" + output);
  }
  finalize(1);
};

const timeout = setTimeout(() => {
  output += "\n[smoke-test] timeout waiting for Electron to exit\n";
  child.kill();
  setTimeout(() => failNow("timeout waiting for Electron to exit"), 500);
}, 8_000);

child.on("error", (error) => {
  output += `\n[smoke-test] spawn error: ${error.message}\n`;
  failNow(`spawn error: ${error.message}`);
});

child.on("close", () => {
  if (finalized) return;

  const fatalPatterns = [
    "Cannot find module",
    "MODULE_NOT_FOUND",
    "Refused to execute",
    "Uncaught Error",
    "Uncaught TypeError",
    "Uncaught ReferenceError",
  ];
  const failures = fatalPatterns.filter((pattern) => output.includes(pattern));
  const probeMatch = output.match(/\[browser-probe\] success bytes=(\d+)/);
  const probeBytes = probeMatch ? Number.parseInt(probeMatch[1], 10) : null;

  if (failures.length > 0 || probeBytes === null || probeBytes < 1_000) {
    console.error("\nDesktop smoke test failed:");
    for (const failure of failures) {
      console.error(` - ${failure}`);
    }
    if (probeBytes === null) {
      console.error(" - browser composition probe did not report success");
    } else if (probeBytes < 1_000) {
      console.error(
        ` - browser composition probe capture was unexpectedly small (${probeBytes} bytes)`,
      );
    }
    console.error("\nFull output:\n" + output);
    finalize(1);
    return;
  }

  console.log("Desktop smoke test passed.");
  finalize(0);
});
