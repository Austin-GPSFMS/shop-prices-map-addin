/**
 * Everything drawn on the MyGeotab map lives here, so the React panel never
 * touches service.canvas directly.
 */

import { BRAND } from "../config";
import type {
  ICanvasElement,
  ICanvasMarkerAttributes,
  ICanvasPathAttributes,
  ILocation,
  IMapAddInService,
  NearestShop,
  ShopMetrics,
} from "../types";
import { circlePolygon } from "../utils/geo";
import { formatDate, formatInt, miles, money, pct } from "../utils/format";
import { bandLabel, pinSvg, vehicleSvg } from "./pin";

/**
 * Marker anchoring. service.canvas.marker() draws the image with its top-left
 * corner on `coords`; dx/dy shift it so the pin's pointer tip sits exactly on
 * the shop. If pins look offset in a particular MyGeotab release, this is the
 * only place to adjust.
 */
function anchorFor(width: number, height: number) {
  return { dx: -Math.round(width / 2), dy: -height };
}

const Z_RADIUS = 5;
const Z_LINK = 6;
const Z_PIN = 10;
const Z_PIN_SELECTED = 11;
const Z_VEHICLE = 12;

export interface LayerCallbacks {
  onSelect(shopId: number): void;
  onHover(shopId: number | null): void;
}

interface PinHandle {
  marker: ICanvasElement<ICanvasMarkerAttributes>;
}

export class ShopLayer {
  private pins = new Map<number, PinHandle>();
  private extras: ICanvasElement<any>[] = [];
  private tooltipSeq = 1;
  private tooltipsEnabled = true;

  constructor(
    private service: IMapAddInService,
    private cb: LayerCallbacks
  ) {}

  setTooltips(enabled: boolean) {
    this.tooltipsEnabled = enabled;
    if (!enabled) this.service.tooltip.hide();
  }

  /** Redraw all pins. Cheap enough to do on every settings change (≤ a few hundred shops). */
  render(metrics: ShopMetrics[], selectedId: number | null, compareTo: "nearby" | "fleet") {
    for (const h of this.pins.values()) h.marker.remove();
    this.pins.clear();

    for (const m of metrics) {
      const selected = m.shop.id === selectedId;
      const preferred = m.shop.labels.some((l) => /preferred|approved|contract/i.test(l));
      const { href, width, height } = pinSvg(m.pinLabel, m.band, selected, preferred);
      const coords: ILocation = { lat: m.shop.lat, lng: m.shop.lng };
      const marker = this.service.canvas.marker(coords, width, height, href, selected ? Z_PIN_SELECTED : Z_PIN);
      marker.change(anchorFor(width, height));
      marker.attach("click", () => this.cb.onSelect(m.shop.id));
      marker.attach("over", () => {
        this.cb.onHover(m.shop.id);
        if (this.tooltipsEnabled) this.showTooltip(m, compareTo);
      });
      marker.attach("out", () => {
        this.cb.onHover(null);
        if (this.tooltipsEnabled) this.service.tooltip.hide();
      });
      this.pins.set(m.shop.id, { marker });
    }
  }

  private showTooltip(m: ShopMetrics, compareTo: "nearby" | "fleet") {
    const idx = compareTo === "nearby" ? m.indexNearby : m.indexFleet;
    const vs = compareTo === "nearby" ? `vs ${formatInt(m.nearbyCount)} nearby` : "vs fleet";
    const secondary = [
      `${m.shop.city}, ${m.shop.region}`,
      idx != null ? `${pct(idx)} ${vs} · ${bandLabel(m.band)}` : bandLabel(m.band),
    ];
    const additional = [
      `${formatInt(m.shop.visits)} visits · ${money(m.shop.spend)} spend`,
      `Avg invoice ${money(m.avgInvoice)}` + (m.laborRate != null ? ` · Labor ${money(m.laborRate)}/hr` : ""),
      `Last visit ${formatDate(m.shop.lastVisit)}`,
    ];
    if (m.taskAvg != null) additional.unshift(`Selected service: ${money(m.taskAvg)} avg (${m.taskCount})`);
    this.service.tooltip.showAt(
      { lat: m.shop.lat, lng: m.shop.lng },
      { main: m.shop.name, secondary, additional },
      this.tooltipSeq++
    );
  }

  /** Dashed circle showing the "nearby" radius around a shop. */
  drawRadius(center: ILocation, radiusMi: number) {
    const pts = circlePolygon(center, radiusMi);
    const path: ICanvasPathAttributes["path"] = [
      { type: "M", points: [pts[0]] },
      ...pts.slice(1).map((p) => ({ type: "L" as const, points: [p] })),
      { type: "Z", points: [] },
    ];
    const el = this.service.canvas.path(path, Z_RADIUS);
    el.change({ stroke: BRAND.navy, "stroke-width": 1.5, fill: BRAND.blue, "fill-opacity": 0.06 });
    this.extras.push(el);
  }

  /** Vehicle marker plus a line to each recommended shop. */
  drawVehicleLinks(from: ILocation, nearest: NearestShop[]) {
    nearest.forEach((n, i) => {
      const to: ILocation = { lat: n.metrics.shop.lat, lng: n.metrics.shop.lng };
      const el = this.service.canvas.path(
        [
          { type: "M", points: [from] },
          { type: "L", points: [to] },
        ],
        Z_LINK
      );
      el.change({ stroke: i === 0 ? BRAND.green : BRAND.navy, "stroke-width": i === 0 ? 3 : 2, "fill-opacity": 0 });
      this.extras.push(el);
      const label = this.service.canvas.text(
        { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 },
        `${miles(n.distanceMi)}`,
        Z_LINK + 1
      );
      label.change({ "font-size": 11, "font-weight": 700, fill: BRAND.dark, dy: -4 });
      this.extras.push(label);
    });
    const v = vehicleSvg();
    const marker = this.service.canvas.marker(from, v.width, v.height, v.href, Z_VEHICLE);
    marker.change({ dx: -v.width / 2, dy: -v.height / 2 });
    this.extras.push(marker);
  }

  clearExtras() {
    for (const e of this.extras) {
      try {
        e.remove();
      } catch {
        /* already gone */
      }
    }
    this.extras = [];
  }

  destroy() {
    this.clearExtras();
    for (const h of this.pins.values()) h.marker.remove();
    this.pins.clear();
    this.service.tooltip.hide();
  }
}
