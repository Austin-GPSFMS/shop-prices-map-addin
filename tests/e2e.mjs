/**
 * Headless smoke test against the dev harness (dist-harness/ must be built:
 * `npm run build:harness`, or just `npm test`).
 *
 *   node tests/e2e.mjs            → uses Playwright's bundled Chromium
 *   CHROMIUM=/path/to/chromium    → use a specific binary
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4173;
const URL = `http://localhost:${PORT}/`;
mkdirSync(path.join(root, "tests/screenshots"), { recursive: true });

const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const server = spawn(process.execPath, [viteBin, "preview", "--config", "vite.harness.config.ts", "--port", String(PORT), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("vite preview did not start")), 30000);
  server.stdout.on("data", (d) => {
    if (String(d).includes("localhost")) {
      clearTimeout(t);
      resolve();
    }
  });
  server.stderr.on("data", (d) => process.stderr.write(d));
});

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  // No internet needed: drop map tiles.
  await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());

  await page.goto(URL, { waitUntil: "load" });
  await page.waitForSelector(".harness-marker img", { timeout: 20000 });
  await page.waitForTimeout(500);

  const pins = await page.locator(".harness-marker img").count();
  check(pins === 28, `28 shop pins drawn on the map (got ${pins})`);

  const headerText = await page.locator(".gsp-list-head").innerText();
  check(/28 shops/.test(headerText), `panel lists 28 shops ("${headerText.trim().split("\n")[0]}")`);

  const tiles = await page.locator(".gsp-summary").innerText();
  check(/Spend/.test(tiles) && /Avg labor rate/.test(tiles), "summary tiles rendered");

  // Pins carry a percentage label when no service is selected.
  const firstPinSrc = await page.locator(".harness-marker img").first().getAttribute("src");
  check(firstPinSrc?.startsWith("data:image/svg+xml;base64,"), "pin is a data: SVG");
  const svg = Buffer.from(firstPinSrc.split(",")[1], "base64").toString("utf8");
  check(/%<\/text>/.test(svg) || /—<\/text>/.test(svg), `pin label is a % index (${svg.match(/>([^<]*)<\/text>/)?.[1]})`);

  // Hover → tooltip popup.
  await page.evaluate(() => window.__harness.hoverFirstPin());
  await page.waitForTimeout(200);
  const tip = await page.locator(".harness-tooltip").count();
  check(tip === 1, "hovering a pin shows a tooltip");

  // Click first list row → detail view.
  const firstName = (await page.locator(".gsp-row strong").first().innerText()).trim();
  await page.locator(".gsp-row").first().click();
  await page.waitForSelector('[data-testid="shop-detail"]');
  const detailName = (await page.locator('[data-testid="shop-detail"] h3').innerText()).trim();
  check(detailName === firstName, `clicking a row opens its detail (${detailName})`);
  const taskRows = await page.locator('[data-testid="shop-detail"] .gsp-table').first().locator("tbody tr").count();
  check(taskRows >= 5, `detail shows cost-by-service table (${taskRows} rows)`);
  const layers = await page.evaluate(() => window.__harness.layerCount());
  check(layers === 29, `radius ring drawn around selected shop (layers=${layers})`);
  await page.screenshot({ path: path.join(root, "tests/screenshots/detail.png") });

  // Clicking a service row filters the map to that task → pins now show $ amounts.
  await page.locator('[data-testid="shop-detail"] .gsp-table tbody tr').first().click();
  await page.waitForTimeout(300);
  const src2 = await page.locator(".harness-marker img").first().getAttribute("src");
  const svg2 = Buffer.from(src2.split(",")[1], "base64").toString("utf8");
  check(/\$[\d,]+<\/text>/.test(svg2) || /—<\/text>/.test(svg2), `task filter switches pin labels to $ (${svg2.match(/>([^<]*)<\/text>/)?.[1]})`);
  // Toolbar dropdown reflects the task.
  const toolbarText = await page.locator(".gsp-toolbar").innerText();
  check(!/All services/.test(toolbarText), "service dropdown shows the selected task");

  // Back to list, clear the task filter via the detail table again.
  await page.locator('[data-testid="shop-detail"] .gsp-table tbody tr').first().click();
  await page.locator('[data-testid="shop-detail"] button', { hasText: "All shops" }).click();
  await page.waitForSelector(".gsp-rows");

  // Vehicle right-click flow: open the device menu and fire our action.
  await page.evaluate(() => window.__harness.openDeviceMenu("b1"));
  await page.waitForSelector(".harness-menu[data-menu=device] div");
  const menuItem = await page.locator(".harness-menu[data-menu=device] div").first().innerText();
  check(/Nearest shops by price/.test(menuItem), `device action-list menu shows our item ("${menuItem}")`);
  await page.locator(".harness-menu[data-menu=device] div").first().click();
  await page.waitForSelector('[data-testid="vehicle-panel"]', { timeout: 10000 });
  const ranked = await page.locator('[data-testid="vehicle-panel"] .gsp-row').count();
  check(ranked === 5, `vehicle panel ranks 5 shops (${ranked})`);
  const vName = (await page.locator('[data-testid="vehicle-panel"] h3').innerText()).trim();
  check(/WP-1042/.test(vName), `vehicle name resolved through service.api (${vName})`);
  const layers2 = await page.evaluate(() => window.__harness.layerCount());
  check(layers2 === 28 + 5 + 5 + 1, `links, distance labels and vehicle marker drawn (layers=${layers2})`);
  await page.screenshot({ path: path.join(root, "tests/screenshots/vehicle.png") });

  // Settings persisted through service.localStorage.
  const stored = await page.evaluate(() => window.localStorage.getItem("gpsfms.shopPrices.settings.v1"));
  check(!!stored && JSON.parse(stored).task === "", "settings persisted via service.localStorage");

  // Only-in-view filter.
  await page.getByRole("tab", { name: "Shops" }).click().catch(() => page.getByText("Shops", { exact: true }).first().click());
  await page.waitForSelector(".gsp-rows");
  await page.evaluate(() => window.__harness.map.setView([27.95, -82.45], 11));
  await page.waitForTimeout(300);
  await page.locator(".gsp-check", { hasText: "Only shops in view" }).locator("span").click();
  await page.waitForTimeout(300);
  const inView = await page.locator(".gsp-list-head").innerText();
  check(/\b([1-9]|1[0-9]) shops?\b/.test(inView), `"only in view" trims the list (${inView.trim().split("\n")[0]})`);
  await page.screenshot({ path: path.join(root, "tests/screenshots/list.png") });

  const realErrors = errors.filter((e) => !/tile\.openstreetmap|net::ERR_FAILED|Failed to load resource/.test(e));
  check(realErrors.length === 0, `no console/page errors${realErrors.length ? ":\n  " + realErrors.join("\n  ") : ""}`);
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
