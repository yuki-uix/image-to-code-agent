#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function fail(message) {
  console.error(`capture-page: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    args[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function findChrome() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ];
  return candidates.find((path) => {
    try {
      return process.getBuiltinModule("node:fs").existsSync(path);
    } catch {
      return false;
    }
  });
}

function waitForDevtools(process, timeoutMs = 10000) {
  return new Promise((resolvePromise, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => reject(new Error("Chrome DevTools endpoint did not start")), timeoutMs);
    const onData = (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        process.stderr.off("data", onData);
        resolvePromise(match[1]);
      }
    };
    process.stderr.on("data", onData);
    process.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before DevTools was ready (${code})`));
    });
  });
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolvePromise, reject) => {
      this.socket.addEventListener("open", resolvePromise, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolvePromise(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

const args = parseArgs(process.argv.slice(2));
if (!args.html || !args.out) {
  fail("usage: node capture-page.mjs --html <index.html> --out <screenshot.png> [--width 1440] [--height 900] [--wait-ms 500] [--measurements <layout-measurements.json>]");
}

const chrome = findChrome();
if (!chrome) fail("Google Chrome or Chromium is required for automated capture");

const width = Math.max(1, Math.round(Number(args.width ?? 1440)));
const height = Math.max(1, Math.round(Number(args.height ?? 900)));
const waitMs = Math.max(0, Math.round(Number(args["wait-ms"] ?? 500)));
const htmlPath = resolve(args.html);
const outputPath = resolve(args.out);
const measurementsPath = args.measurements ? resolve(args.measurements) : null;
const profileDir = await mkdtemp(`${tmpdir()}/image-to-code-chrome-`);
const browser = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--allow-file-access-from-files",
  "--force-device-scale-factor=1",
  "--remote-debugging-port=0",
  `--user-data-dir=${profileDir}`,
  "about:blank"
], { stdio: ["ignore", "ignore", "pipe"] });

let client;
try {
  const browserWs = await waitForDevtools(browser);
  const endpoint = new URL(browserWs);
  const list = await fetch(`${endpoint.protocol === "wss:" ? "https:" : "http:"}//${endpoint.host}/json/list`, { signal: AbortSignal.timeout(10000) }).then((response) => response.json());
  const page = list.find((target) => target.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("Chrome page target not found");

  client = new CdpClient(page.webSocketDebuggerUrl);
  await client.open();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: pathToFileURL(htmlPath).href });
  await client.send("Runtime.evaluate", {
    expression: `Promise.race([new Promise((resolve) => {
      const done = () => Promise.all([
        document.fonts?.ready ?? Promise.resolve(),
        ...Array.from(document.images).map((image) => image.complete ? Promise.resolve() : new Promise((r) => {
          image.addEventListener('load', r, { once: true });
          image.addEventListener('error', r, { once: true });
        }))
      ]).then(() => setTimeout(resolve, ${waitMs}));
      if (document.readyState === 'complete') done();
      else window.addEventListener('load', done, { once: true });
    }), new Promise((resolve) => setTimeout(resolve, ${waitMs + 10000}))])`,
    awaitPromise: true,
    returnByValue: true
  });

  const metrics = await client.send("Page.getLayoutMetrics");
  const content = metrics.cssContentSize ?? metrics.contentSize;
  const documentWidth = Math.max(width, Math.ceil(content.width));
  const documentHeight = Math.max(height, Math.ceil(content.height));
  if (documentWidth > 10000 || documentHeight > 30000) throw new Error(`Refusing oversized capture ${documentWidth}x${documentHeight}`);

  const measured = await client.send("Runtime.evaluate", {
    expression: `(() => ({
      regions: Array.from(document.querySelectorAll('[data-source-region]')).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          sourceRegionId: element.getAttribute('data-source-region'),
          instances: Number(element.getAttribute('data-source-instances') || 1),
          bbox: {
            x: Math.round((rect.left + window.scrollX) * 100) / 100,
            y: Math.round((rect.top + window.scrollY) * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100
          }
        };
      })
    }))()`,
    returnByValue: true
  });

  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    fromSurface: true,
    clip: { x: 0, y: 0, width: documentWidth, height: documentHeight, scale: 1 }
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(screenshot.data, "base64"));

  if (measurementsPath) {
    const measurements = {
      meta: { schemaVersion: 1, html: htmlPath },
      viewport: { width, height },
      document: { width: documentWidth, height: documentHeight },
      regions: measured?.result?.value?.regions ?? []
    };
    await mkdir(dirname(measurementsPath), { recursive: true });
    await writeFile(measurementsPath, `${JSON.stringify(measurements, null, 2)}\n`);
  }

  console.log(JSON.stringify({
    valid: true,
    html: htmlPath,
    screenshot: outputPath,
    viewport: { width, height },
    document: { width: documentWidth, height: documentHeight },
    ...(measurementsPath ? { measurements: measurementsPath, regionsMeasured: measured?.result?.value?.regions?.length ?? 0 } : {})
  }, null, 2));
} catch (error) {
  console.error(`capture-page: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
} finally {
  client?.close();
  if (browser.exitCode === null) {
    browser.kill("SIGTERM");
    await Promise.race([
      new Promise((resolvePromise) => browser.once("exit", resolvePromise)),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 3000))
    ]);
  }
  if (browser.exitCode === null) {
    browser.kill("SIGKILL");
    await Promise.race([
      new Promise((resolvePromise) => browser.once("exit", resolvePromise)),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 1000))
    ]);
  }
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
