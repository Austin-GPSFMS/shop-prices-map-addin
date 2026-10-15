/**
 * Dev harness: fakes the MyGeotab Map Add-In `service` on top of Leaflet so the
 * add-in can run in a plain browser tab (npm run dev) and in headless tests.
 *
 * It mirrors the documented API surface used by src/ (canvas, events, map,
 * tooltip, actionList, localStorage, page, api). Fidelity is "good enough to
 * develop against", not pixel-exact; the real MyGeotab map is the final check.
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { gpsfmsShopPricesMount } from "../src/main";
import type {
  ICanvasElement,
  ICoordinate,
  ILocation,
  IMapAddInService,
  IMapBounds,
  IMenuActionItem,
  IMenuEventData,
  IPathSeg,
  ITooltip,
  TMenuType,
  TPosition,
} from "../src/types";

const map = L.map("map", { zoomControl: true }).setView([28.2, -81.9], 8);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

type Handler = (data: any) => void;
const registry = new Map<string, Set<Handler>>();
function on(ns: string, name: string, h: Handler) {
  const key = `${ns}:${name}`;
  if (!registry.has(key)) registry.set(key, new Set());
  registry.get(key)!.add(h);
}
function off(ns: string, name: string, h?: Handler) {
  const key = `${ns}:${name}`;
  if (!h) registry.delete(key);
  else registry.get(key)?.delete(h);
}
function emit(ns: string, name: string, data: any) {
  registry.get(`${ns}:${name}`)?.forEach((h) => h(data));
}

function toLatLng(p: TPosition): L.LatLng {
  if ("lat" in p) return L.latLng(p.lat, p.lng);
  return map.containerPointToLatLng(L.point((p as ICoordinate).x, (p as ICoordinate).y));
}

const layers = new Set<L.Layer>();

function wrap<T extends Record<string, any>>(layer: L.Layer, apply: (attrs: T) => void): ICanvasElement<T> {
  let removed = false;
  layer.addTo(map);
  layers.add(layer);
  const el: ICanvasElement<T> = {
    change(attrs) {
      if (!removed) apply(attrs);
      return el;
    },
    remove() {
      if (removed) return;
      removed = true;
      map.removeLayer(layer);
      layers.delete(layer);
    },
    isRemoved: () => removed,
    attach(event, handler) {
      const ev = event === "over" ? "mouseover" : event === "out" ? "mouseout" : "click";
      layer.on(ev, (e: any) => {
        const pt = e.containerPoint ?? map.latLngToContainerPoint(e.latlng);
        handler({ x: pt.x, y: pt.y });
      });
      return el;
    },
    detach() {
      return el;
    },
  };
  return el;
}

const canvas: IMapAddInService["canvas"] = {
  marker(coords, width, height, source, zIndex) {
    const state = { width, height, dx: 0, dy: 0, href: String(source), coords: toLatLng(coords) };
    const icon = () =>
      L.divIcon({
        className: "harness-marker",
        iconSize: [state.width, state.height],
        iconAnchor: [-state.dx, -state.dy],
        html: `<img src="${state.href}" width="${state.width}" height="${state.height}" draggable="false" style="display:block" />`,
      });
    const m = L.marker(state.coords, { icon: icon(), zIndexOffset: zIndex * 100, keyboard: false });
    return wrap(m, (a: any) => {
      if (a.width != null) state.width = a.width;
      if (a.height != null) state.height = a.height;
      if (a.dx != null) state.dx = a.dx;
      if (a.dy != null) state.dy = a.dy;
      if (a.href != null) state.href = a.href;
      if (a.coords) {
        state.coords = toLatLng(a.coords);
        m.setLatLng(state.coords);
      }
      m.setIcon(icon());
    });
  },
  text(coords, text, zIndex) {
    const state = { text, size: 12, weight: 400, fill: "#000", dx: 0, dy: 0 };
    const icon = () =>
      L.divIcon({
        className: "harness-marker",
        iconSize: [0, 0],
        html: `<span style="position:absolute;transform:translate(-50%,-50%) translate(${state.dx}px,${state.dy}px);white-space:nowrap;font:${state.weight} ${state.size}px Roboto,Arial;color:${state.fill};text-shadow:0 0 3px #fff,0 0 3px #fff">${text}</span>`,
      });
    const m = L.marker(toLatLng(coords), { icon: icon(), zIndexOffset: zIndex * 100, interactive: false });
    return wrap(m, (a: any) => {
      if (a.text != null) state.text = a.text;
      if (a["font-size"] != null) state.size = a["font-size"];
      if (a["font-weight"] != null) state.weight = a["font-weight"];
      if (a.fill != null) state.fill = a.fill;
      if (a.dx != null) state.dx = a.dx;
      if (a.dy != null) state.dy = a.dy;
      m.setIcon(icon());
    });
  },
  path(segs: IPathSeg[], _zIndex) {
    const pts: L.LatLng[] = [];
    let closed = false;
    for (const s of segs) {
      if (s.type === "Z") closed = true;
      for (const p of s.points) if (typeof p === "object" && "lat" in p) pts.push(L.latLng(p.lat, p.lng));
    }
    const layer = closed
      ? L.polygon(pts, { color: "#000", weight: 1, fillOpacity: 0.1 })
      : L.polyline(pts, { color: "#000", weight: 2 });
    return wrap(layer, (a: any) => {
      const style: L.PathOptions = {};
      if (a.stroke) style.color = a.stroke;
      if (a["stroke-width"] != null) style.weight = a["stroke-width"];
      if (a.fill) style.fillColor = a.fill;
      if (a["fill-opacity"] != null) style.fillOpacity = a["fill-opacity"];
      layer.setStyle(style);
    });
  },
  circle(coords, radius, _zIndex) {
    const c = L.circleMarker(toLatLng(coords), { radius });
    return wrap(c, (a: any) => {
      const style: L.PathOptions = {};
      if (a.stroke) style.color = a.stroke;
      if (a.fill) style.fillColor = a.fill;
      if (a["fill-opacity"] != null) style.fillOpacity = a["fill-opacity"];
      c.setStyle(style);
      if (a.r != null) c.setRadius(a.r);
    });
  },
  rect(coords, width, height, _radius, zIndex) {
    const m = L.marker(toLatLng(coords), {
      icon: L.divIcon({ className: "harness-marker", iconSize: [width, height], html: `<div style="width:${width}px;height:${height}px;background:#999"></div>` }),
      zIndexOffset: zIndex * 100,
    });
    return wrap(m, () => undefined);
  },
  clear() {
    for (const l of layers) map.removeLayer(l);
    layers.clear();
  },
};

const bounds = (): IMapBounds => {
  const b = map.getBounds();
  return { sw: { lat: b.getSouth(), lng: b.getWest() }, ne: { lat: b.getNorth(), lng: b.getEast() } };
};
map.on("moveend zoomend", () => emit("map", "changed", { zoom: map.getZoom(), bounds: bounds() }));
map.on("move", () => emit("map", "change", {}));
map.on("mousemove", (e) => emit("events", "move", { x: e.containerPoint.x, y: e.containerPoint.y }));

let popup: L.Popup | null = null;
function tooltipHtml(p: ITooltip): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return (
    `<div class="harness-tooltip">` +
    (p.main ? `<div class="main">${esc(p.main)}</div>` : "") +
    (p.secondary ?? []).map((s) => `<div>${esc(s)}</div>`).join("") +
    (p.additional ?? []).map((s) => `<div class="additional">${esc(s)}</div>`).join("") +
    `</div>`
  );
}

const menuHandlers = new Map<TMenuType, Set<(name: string, data: IMenuEventData) => IMenuActionItem[] | Promise<IMenuActionItem[]>>>();
let menuEl: HTMLDivElement | null = null;
function closeMenu() {
  menuEl?.remove();
  menuEl = null;
}
async function openMenu(menuName: TMenuType, data: IMenuEventData, extra: IMenuActionItem[] = []) {
  closeMenu();
  const items: IMenuActionItem[] = [...extra];
  for (const h of menuHandlers.get(menuName) ?? []) items.push(...(await h(menuName, data)));
  if (!items.length) return;
  menuEl = document.createElement("div");
  menuEl.className = "harness-menu";
  menuEl.dataset.menu = menuName;
  menuEl.style.left = `${data.x}px`;
  menuEl.style.top = `${data.y}px`;
  for (const it of items) {
    const row = document.createElement("div");
    row.textContent = it.title;
    row.dataset.clickEvent = it.clickEvent ?? "";
    row.onclick = () => {
      closeMenu();
      if (it.clickEvent) emit("actionList", it.clickEvent, it.data);
    };
    menuEl.appendChild(row);
  }
  document.body.appendChild(menuEl);
}
document.addEventListener("click", closeMenu);
map.on("contextmenu", (e) => {
  void openMenu("map", {
    x: e.containerPoint.x,
    y: e.containerPoint.y,
    menuName: "map",
    location: { lat: e.latlng.lat, lng: e.latlng.lng },
  });
});

// ---- Fake fleet (three trucks) ----
const vehicles: Record<string, { name: string; location: ILocation }> = {
  b1: { name: "WP-1042 (Tampa)", location: { lat: 27.97, lng: -82.46 } },
  b2: { name: "WP-1107 (Orlando)", location: { lat: 28.52, lng: -81.38 } },
  b3: { name: "WP-1203 (Lakeland)", location: { lat: 28.06, lng: -81.95 } },
};
for (const [id, v] of Object.entries(vehicles)) {
  const m = L.marker(v.location, {
    icon: L.divIcon({
      className: "harness-marker",
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      html: `<div data-vehicle="${id}" title="${v.name}" style="width:26px;height:26px;border-radius:50%;background:#1c2b39;border:2px solid #fff;color:#fff;font-size:14px;line-height:22px;text-align:center">🚛</div>`,
    }),
    zIndexOffset: 2000,
  }).addTo(map);
  m.on("contextmenu", (e) => {
    void openMenu("device", {
      x: e.containerPoint.x,
      y: e.containerPoint.y,
      menuName: "device",
      location: v.location,
      device: { id },
    });
  });
}

const service: IMapAddInService = {
  api: {
    async call(method, params: any) {
      return (await service.api.multiCall([[method, params]]))[0];
    },
    async multiCall(calls) {
      return calls.map(([method, params]: [string, any]) => {
        if (method === "Get" && params.typeName === "Device") {
          const v = vehicles[params.search?.id];
          return v ? [{ id: params.search.id, name: v.name }] : [];
        }
        if (method === "Get" && params.typeName === "DeviceStatusInfo") {
          const v = vehicles[params.search?.deviceSearch?.id];
          return v ? [{ device: { id: params.search.deviceSearch.id }, latitude: v.location.lat, longitude: v.location.lng, dateTime: new Date().toISOString() }] : [];
        }
        return [];
      });
    },
    async getSession() {
      return { database: "demo_db", userName: "austin@gpsfms.com", sessionId: "harness", domain: "my.geotab.com" };
    },
  },
  canvas,
  events: {
    attach: (n, h) => on("events", n, h),
    detach: (n, h) => off("events", n, h),
  },
  map: {
    async setBounds(b) {
      map.fitBounds(L.latLngBounds([b.sw.lat, b.sw.lng], [b.ne.lat, b.ne.lng]));
      return true;
    },
    async getBounds() {
      return bounds();
    },
    async setZoom(z) {
      map.setZoom(z);
      return true;
    },
    async getZoom() {
      return map.getZoom();
    },
    attach: (n, h) => on("map", n, h),
    detach: (n, h) => off("map", n, h),
  },
  tooltip: {
    showAt(position, pattern) {
      popup?.remove();
      popup = L.popup({ closeButton: false, autoPan: false, offset: L.point(0, -30), className: "harness-popup" })
        .setLatLng(toLatLng(position))
        .setContent(tooltipHtml(pattern))
        .openOn(map);
    },
    show(pattern) {
      if (popup) popup.setContent(popup.getContent() + tooltipHtml(pattern));
    },
    hide() {
      popup?.remove();
      popup = null;
    },
  },
  actionList: {
    show(position, _title, items) {
      const pt = "lat" in position ? map.latLngToContainerPoint(toLatLng(position)) : L.point(position.x, position.y);
      void openMenu("marker", { x: pt.x, y: pt.y, menuName: "marker", location: toLatLng(position) }, items);
    },
    attachMenu(name, handler) {
      if (!menuHandlers.has(name)) menuHandlers.set(name, new Set());
      menuHandlers.get(name)!.add(handler);
    },
    detachMenu(name, handler) {
      if (handler) menuHandlers.get(name)?.delete(handler as any);
      else menuHandlers.delete(name);
    },
    attach: (n, h) => on("actionList", n, h),
    detach: (n, h) => off("actionList", n, h),
  },
  localStorage: {
    async set(k, v) {
      window.localStorage.setItem(k, v);
      return true;
    },
    async get(k) {
      return window.localStorage.getItem(k);
    },
    async remove(k) {
      window.localStorage.removeItem(k);
      return true;
    },
  },
  page: {
    async set() {
      return true;
    },
    async get() {
      return {};
    },
    async go() {
      return true;
    },
    attach(n, h) {
      on("page", n, h);
      if (n === "focus") setTimeout(() => h({}), 0);
    },
    detach: (n, h) => off("page", n, h as Handler),
    active: true,
  },
};

gpsfmsShopPricesMount(document.getElementById("addin")!, service);

// Hooks for headless tests.
(window as any).__harness = {
  map,
  vehicles,
  layerCount: () => layers.size,
  openDeviceMenu: (id: string) => {
    const v = vehicles[id];
    const pt = map.latLngToContainerPoint(v.location);
    return openMenu("device", { x: pt.x, y: pt.y, menuName: "device", location: v.location, device: { id } });
  },
  fire: (event: string, data: unknown) => emit("actionList", event, data),
  hoverFirstPin: () => {
    const img = document.querySelector<HTMLImageElement>(".harness-marker img");
    img?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    return !!img;
  },
};
