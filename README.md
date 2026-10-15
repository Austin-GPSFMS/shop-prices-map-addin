# Shop Prices — MyGeotab Map Add-In

A GPSFMS **Map Add-In** that overlays repair-shop pricing on the live MyGeotab
map. Every vendor the fleet has paid gets a price-tag pin coloured by how its
invoices compare, like-for-like, with the other shops around it; the side
panel ranks shops, breaks a shop down by service, and — from a vehicle's
right-click menu — recommends the nearest shops weighted by price.

Pricing comes from **Fleetio service entries** (invoices) via a small Lambda
proxy (`proxy/`). With no proxy configured the add-in runs on a bundled demo
dataset so it can be shown to a client before their Fleetio account is wired up.

| Pin label | Meaning |
|---|---|
| `−12%` (green) | This shop charged 12% less than the comparison median for the same mix of services |
| `+8%` (red) / `+3%` (amber) | Above the median / within ±5% of it |
| `$187` | A service is selected in the toolbar — the pin shows the shop's average for that service |
| `n/a` (grey) | Nothing comparable (no other shop did the same services in range) |
| `★` | Vendor labelled Preferred / Approved / Contract in Fleetio |

## How prices are compared

1. For each shop and service task: `avg = Σ(labor_cost + parts_cost) / count` over its line items.
2. For each task, the **median** of other shops' averages — either every shop in the dataset
   ("fleet") or the shops within the nearby radius ("nearby", default 25 mi).
3. Shop index = Σ `count_t · (avg_t / median_t)` / Σ `count_t` → 0.88 means "12% cheaper for the same work".
   Selecting one service collapses the index to that service.
4. Labor rate = labor $ ÷ hours, using only invoices that recorded `labor_time_in_seconds`.
5. "Spent above the median" = what the above-median shops cost beyond the median for the work they did —
   a ceiling on what steering that work elsewhere could have saved.

(`src/data/metrics.ts`)

## Map Add-In mechanics

Map Add-Ins are not page add-ins. MyGeotab injects `mapScript.src` / `mapScript.style`
into a sandboxed iframe on the Map page and calls `window.geotab.addin.gpsfmsShopPrices(elt, service)`,
where `elt` is our 450 px panel and `service` is the Map Add-In API
(https://developers.geotab.com/myGeotab/addIns/mapAddIns/). This project therefore builds **one
IIFE script + one stylesheet with fixed names** (`dist/shop-prices.js`, `dist/shop-prices.css`),
with Zenith's fonts referenced by absolute GitHub Pages URL (see `vite.config.ts`).

What we use from `service`:

- `canvas.marker` (price-tag SVG pins as data: URIs), `canvas.path` (radius ring, vehicle→shop links), `canvas.text` (distance labels)
- `tooltip.showAt` on pin hover; `map.getBounds/setBounds` + `map.attach("changed")` for "only shops in view", zoom-to and fit-all
- `actionList.attachMenu("device"|"map")` → "Nearest shops by price" / "Shops near here by price"; `api.multiCall` fetches that one vehicle's `Device` + `DeviceStatusInfo` (never the whole fleet)
- `localStorage` for settings and a 30-minute dataset cache (the iframe is destroyed whenever the user leaves the Map page)
- `api.getSession()` → sent to the proxy, which validates it against the user's MyGeotab server before touching Fleetio

## Layout

```
shop-prices-map-addin/
├── config.json              ← MyGeotab Add-In manifest (page: "map", mapScript src/style)
├── vite.config.ts           ← IIFE build → dist/shop-prices.{js,css} (+ dist/assets fonts)
├── vite.harness.config.ts   ← dev harness build (dev/ → dist-harness/)
├── dist/                    ← committed build output served by GitHub Pages
├── src/
│   ├── main.tsx             ← registers window.geotab.addin.gpsfmsShopPrices
│   ├── types.ts             ← Map Add-In service types + ShopDataset/ShopMetrics
│   ├── config.ts            ← defaults, storage keys, event names, brand colours
│   ├── data/   fetch.ts (proxy → cache → mock) · metrics.ts (index, nearby, ranking) · mock.ts (demo dataset)
│   ├── map/    layer.ts (everything drawn on the map) · pin.ts (SVG pin generator)
│   ├── geotab/ vehicles.ts (Device + DeviceStatusInfo lookup)
│   ├── components/ App · Toolbar · Summary · ShopList · ShopDetail · VehiclePanel · SettingsPanel
│   └── styles.css           ← Zenith CSS + gsp- panel chrome
├── dev/                     ← Leaflet-based fake `service` so the add-in runs in a normal browser tab
├── tests/e2e.mjs            ← headless Playwright smoke test against the harness
└── proxy/                   ← Lambda: MyGeotab session check → Fleetio vendors + service entries → ShopDataset
```

## Install & build (Windows PowerShell)

```powershell
cd C:\Users\User\Projects\shop-prices-map-addin
npm install
npm run build          # → dist/shop-prices.js + dist/shop-prices.css
npm run dev            # harness at http://localhost:5173 (right-click map / trucks for the action menus)
npm test               # builds the harness and runs tests/e2e.mjs headlessly
```

Push to `github.com/Austin-GPSFMS/shop-prices-map-addin`, enable GitHub Pages on `main`,
then install `config.json` in MyGeotab under **Administration → System… → System Settings →
Add-Ins → New Add-In**. The add-in appears as a **Shop Prices** tab on the Map page; nothing is
drawn until that tab is opened the first time (that is when MyGeotab calls the entry function).

`config.json` uses `mapScript.src` + `mapScript.style` (script + stylesheet). `config.url.json`
is the equivalent manifest using `mapScript.url` → `dist/addin.html` (`public/addin.html` in
source, copied by Vite), the same shape as Geotab's `html` sample — use whichever your MyGeotab
build accepts. `title` must be a plain string for map add-ins (not the `{ "en": … }` object that
page add-ins use for `menuName`).

Then deploy `proxy/` (see `proxy/README.md`) and paste its URL under **Settings** in the panel.

## Verify in MyGeotab (first install checklist)

The harness is a faithful-enough stand-in, but a few things can only be confirmed on the real map:

- **Pin anchoring** — pins should point exactly at the shop. If they sit offset, adjust `anchorFor()` in `src/map/layer.ts` (one place).
- **Fonts** — Zenith's Roboto loads from the absolute GitHub Pages URLs in `dist/shop-prices.css`; if MyGeotab inlines the stylesheet differently the panel falls back to system fonts (cosmetic only).
- **Action-list items** — "Nearest shops by price" on a vehicle's right-click menu and "Shops near here by price" on the map menu. `icon` is left blank; set a MyGeotab icon name there if you want one.
- **Tooltip** — hover text uses MyGeotab's own tooltip component (`main` / `secondary` / `additional`).
- **Quota** — the add-in makes no bulk API calls; a vehicle lookup is one `multiCall` of two filtered `Get`s.
- **Registration** — MyGeotab pre-defines `geotab.addin` as a *read-only* property inside the map iframe. Never
  assign to it (`geotab.addin = geotab.addin || {}` throws and MyGeotab logs "Add-in can't be installed … Can't be
  loaded", then removes the tab). `src/main.tsx` only sets its own key; `npm run test:sandbox` loads the built
  bundle in an iframe with the same read-only property and a stub `service` to catch regressions.

## Roadmap ideas

- Google Places lookup for shops the fleet hasn't used yet (no pricing, but "closest certified diesel shop").
- Push "preferred shop" decisions back to Fleetio as vendor labels.
- Monthly Python job that emails "work done above median" per district.
- Geotab `Zone` export for preferred shops so exception rules can flag visits to pricier ones.
