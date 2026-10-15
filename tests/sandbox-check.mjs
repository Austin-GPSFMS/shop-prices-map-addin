/**
 * Loads dist/shop-prices.js inside an iframe sandboxed exactly like MyGeotab's
 * map add-in iframe (sandbox="allow-scripts" → opaque origin) and reports
 * whether the script evaluates, registers the entry, and survives a mount
 * with a stub `service`. Run after `npm run build`:
 *   CHROMIUM=/opt/pw-browsers/chromium node tests/sandbox-check.mjs
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const js = readFileSync(path.join(root, "dist/shop-prices.js"));
const css = readFileSync(path.join(root, "dist/shop-prices.css"));

const inner = `<!doctype html><html><head>
<link rel="stylesheet" href="http://localhost:4199/shop-prices.css">
<script>
  window.onerror = (m, s, l, c, e) => parent.postMessage({ t: "error", m: String(m), stack: e && e.stack }, "*");
  window.addEventListener("unhandledrejection", (e) => parent.postMessage({ t: "rejection", m: String(e.reason && e.reason.stack || e.reason) }, "*"));
  window.geotab = {}; Object.defineProperty(window.geotab, "addin", { value: {}, writable: false, configurable: false, enumerable: true });
  const probe = {};
  try { window.localStorage; probe.localStorage = "ok"; } catch (e) { probe.localStorage = "THROWS: " + e.message; }
  try { window.sessionStorage; probe.sessionStorage = "ok"; } catch (e) { probe.sessionStorage = "THROWS: " + e.message; }
  try { document.cookie; probe.cookie = "ok"; } catch (e) { probe.cookie = "THROWS: " + e.message; }
  parent.postMessage({ t: "probe", origin: location.origin, probe }, "*");
</script>
<script src="http://localhost:4199/shop-prices.js"></script>
<script>
  const keys = Object.keys(window.geotab.addin);
  parent.postMessage({ t: "registered", keys }, "*");
  const calls = [];
  const noop = () => {};
  const p = (v) => Promise.resolve(v);
  const service = {
    api: { call: () => p([]), multiCall: () => p([[], []]), getSession: () => p({ database: "demo", userName: "u", sessionId: "s", domain: "my.geotab.com" }) },
    canvas: { marker: () => el(), text: () => el(), path: () => el(), circle: () => el(), rect: () => el(), clear: noop },
    events: { attach: noop, detach: noop },
    map: { setBounds: () => p(true), getBounds: () => p({ sw: { lat: 27, lng: -83 }, ne: { lat: 29, lng: -80 } }), setZoom: () => p(true), getZoom: () => p(8), attach: noop, detach: noop },
    tooltip: { showAt: noop, show: noop, hide: noop },
    actionList: { show: noop, attachMenu: (n) => calls.push("attachMenu:" + n), detachMenu: noop, attach: (n) => calls.push("attach:" + n), detach: noop },
    localStorage: { set: () => p(true), get: () => p(null), remove: () => p(true) },
    page: { set: () => p(true), get: () => p({}), go: () => p(true), attach: noop, detach: noop, active: true },
  };
  let markers = 0;
  function el() { markers++; const e = { change: () => e, remove: noop, isRemoved: () => false, attach: () => e, detach: () => e }; return e; }
  const elt = document.createElement("div"); (document.body || document.documentElement).appendChild(elt);
  try {
    window.geotab.addin[keys[0]](elt, service);
    setTimeout(() => parent.postMessage({ t: "mounted", html: elt.innerText.slice(0, 300), markers, calls }, "*"), 1500);
  } catch (e) { parent.postMessage({ t: "mountError", m: String(e.stack || e) }, "*"); }
</script></head><body></body></html>`;

const outer = `<!doctype html><html><body><script>
  window.__msgs = [];
  window.addEventListener("message", (e) => window.__msgs.push(e.data));
</script>
<iframe id="f" sandbox="allow-scripts allow-same-origin" src="http://localhost:4199/inner.html" style="width:450px;height:800px"></iframe>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === "/shop-prices.js") { res.setHeader("Content-Type", "application/javascript"); res.end(js); }
  else if (req.url === "/shop-prices.css") { res.setHeader("Content-Type", "text/css"); res.end(css); }
  else if (req.url === "/inner.html") { res.setHeader("Content-Type", "text/html"); res.end(inner); }
  else { res.setHeader("Content-Type", "text/html"); res.end(outer); }
}).listen(4199);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ["--no-sandbox"] });
const page = await browser.newPage();
const consoleMsgs = [];
page.on("console", (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
await page.goto("http://localhost:4199/");
await page.waitForTimeout(3000);
const msgs = await page.evaluate(() => window.__msgs);
console.log(JSON.stringify(msgs, null, 2));
console.log("console:", consoleMsgs.filter((m) => !/favicon/.test(m)).slice(0, 20).join("\n"));
await browser.close();
server.close();
