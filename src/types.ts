/**
 * Shared types.
 *
 * Section 1: a typed subset of the MyGeotab Map Add-In `service` object
 *            (https://developers.geotab.com/myGeotab/addIns/mapAddIns/).
 * Section 2: the shop-pricing dataset served by the Fleetio proxy (and by the
 *            bundled mock generator) plus the metrics derived from it.
 */

// ---------------------------------------------------------------------------
// 1. Map Add-In service (subset we use)
// ---------------------------------------------------------------------------

export interface ILocation {
  lat: number;
  lng: number;
}
export interface ICoordinate {
  x: number;
  y: number;
}
export type TPosition = ILocation | ICoordinate;

export interface IMapBounds {
  sw: ILocation;
  ne: ILocation;
}

export interface ISessionInfo {
  database: string;
  userName: string;
  sessionId: string;
  domain: string;
}

export interface ICanvasStyle {
  fill?: string;
  stroke?: string;
  "stroke-width"?: number;
  "fill-opacity"?: number;
  "font-size"?: number;
  "font-weight"?: number | string;
}
export interface ICanvasMarkerAttributes extends ICanvasStyle {
  height?: number;
  width?: number;
  x?: number;
  y?: number;
  dx?: number;
  dy?: number;
  coords?: TPosition;
  href?: string;
}
export interface ICanvasTextAttributes extends ICanvasStyle {
  dx?: number;
  dy?: number;
  text?: string;
  coords?: TPosition;
}
export interface ICanvasPathAttributes extends ICanvasStyle {
  path?: IPathSeg[];
}
export interface ICanvasCircleAttributes extends ICanvasStyle {
  r?: number;
  coords?: TPosition;
}
export interface IPathSeg {
  type: "M" | "m" | "L" | "l" | "Z" | "C" | "c" | "S" | "s";
  points: Array<ILocation | ICoordinate | number>;
}

export interface ICanvasElement<T> {
  change(attrs: T): ICanvasElement<T>;
  remove(): void;
  isRemoved(): boolean;
  attach(event: "click" | "over" | "out", handler: (data: ICoordinate) => void): ICanvasElement<T>;
  detach(event: "click" | "over" | "out", handler?: (data: ICoordinate) => void): ICanvasElement<T>;
}

export interface ITooltip {
  icon?: string;
  image?: { url?: string; width?: number; height?: number };
  main?: string;
  secondary?: string[];
  additional?: string[];
}

export interface IMenuActionItem {
  title: string;
  icon?: string;
  url?: string;
  clickEvent?: string;
  zIndex?: number;
  data?: unknown;
}
export type TMenuType = "zone" | "map" | "device" | "route" | "marker" | "trip";
export interface IMenuEventData {
  x: number;
  y: number;
  menuName: TMenuType;
  location: ILocation;
  device?: { id: string };
  zone?: { id: string };
  route?: { id: string };
  title?: string;
}

export interface IMapAddInService {
  api: {
    call(method: string, params: object): Promise<any>;
    multiCall(calls: Array<[string, object]>): Promise<any[]>;
    getSession(): Promise<ISessionInfo>;
  };
  canvas: {
    marker(
      coords: TPosition,
      width: number,
      height: number,
      source: string | ArrayBuffer,
      zIndex: number
    ): ICanvasElement<ICanvasMarkerAttributes>;
    text(coords: TPosition, text: string, zIndex: number): ICanvasElement<ICanvasTextAttributes>;
    path(path: IPathSeg[], zIndex: number): ICanvasElement<ICanvasPathAttributes>;
    circle(coords: TPosition, radius: number, zIndex: number): ICanvasElement<ICanvasCircleAttributes>;
    rect(
      coords: TPosition,
      width: number,
      height: number,
      radius: number,
      zIndex: number
    ): ICanvasElement<ICanvasMarkerAttributes>;
    clear(): void;
  };
  events: {
    attach(eventName: string, handler: (data: any) => void): void;
    detach(eventName: string, handler?: (data: any) => void): void;
  };
  map: {
    setBounds(bounds: IMapBounds): Promise<boolean>;
    getBounds(): Promise<IMapBounds>;
    setZoom(zoom: number): Promise<boolean>;
    getZoom(): Promise<number>;
    attach(eventName: "change" | "changed", handler: (data: any) => void): void;
    detach(eventName: "change" | "changed", handler?: (data: any) => void): void;
  };
  tooltip: {
    showAt(position: TPosition, pattern: ITooltip, sequence: number): void;
    show(pattern: ITooltip, sequence: number): void;
    hide(): void;
  };
  actionList: {
    show(position: TPosition, title: string, items: IMenuActionItem[]): void;
    attachMenu(
      menuName: TMenuType,
      handler: (menuName: string, data: IMenuEventData) => IMenuActionItem[] | Promise<IMenuActionItem[]>
    ): void;
    detachMenu(menuName: TMenuType, handler?: unknown): void;
    attach(eventName: string, handler: (data: any) => void): void;
    detach(eventName: string, handler?: (data: any) => void): void;
  };
  localStorage: {
    set(key: string, value: string): Promise<boolean>;
    get(key: string): Promise<string | null | undefined>;
    remove(key: string): Promise<boolean>;
  };
  page: {
    set(key: string, value: string): Promise<boolean>;
    get(): Promise<Record<string, unknown>>;
    go(page: string, state?: object): Promise<boolean>;
    attach(eventName: "focus" | "blur" | "stateChange" | "filterChange", handler: (data: any) => void): void;
    detach(eventName: "focus" | "blur" | "stateChange" | "filterChange", handler?: unknown): void;
    active: boolean;
  };
}

// ---------------------------------------------------------------------------
// 2. Shop pricing dataset (what the proxy / mock return)
// ---------------------------------------------------------------------------

/** Per-service-task roll-up for one shop. Amounts are in the account currency (USD). */
export interface TaskStat {
  /** Number of line items for this task at this shop. */
  count: number;
  /** Sum of (labor_cost + parts_cost || subtotal) over those line items. */
  total: number;
  min: number;
  max: number;
  labor: number;
  parts: number;
}

export interface InvoiceSummary {
  id: number;
  /** ISO date (completed_at). */
  date: string;
  vehicle: string;
  total: number;
  labor: number;
  parts: number;
  /** Service task names on the invoice. */
  tasks: string[];
  reference?: string | null;
  /** Deep link into Fleetio when the proxy can build one. */
  url?: string | null;
}

export interface Shop {
  id: number;
  name: string;
  address: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  labels: string[];
  phone?: string | null;
  website?: string | null;
  /** Fleetio vendor flags. */
  service: boolean;
  parts: boolean;
  fuel: boolean;

  visits: number;
  vehicles: number;
  spend: number;
  laborSpend: number;
  partsSpend: number;
  /** Hours from service entries that recorded labor_time_in_seconds. */
  laborHours: number;
  /** Labor $ from only those entries that had labor time, so the rate is honest. */
  laborSpendTimed: number;
  firstVisit: string | null;
  lastVisit: string | null;
  tasks: Record<string, TaskStat>;
  invoices: InvoiceSummary[];
}

export interface ShopDataset {
  source: "fleetio" | "mock";
  generatedAt: string;
  lookbackMonths: number;
  currency: string;
  account?: string | null;
  shops: Shop[];
  /** Vendors with invoices but no coordinates in Fleetio — can't be drawn. */
  unmappedShops: { id: number; name: string; visits: number; spend: number }[];
  /** All service task names seen, most common first. */
  tasks: string[];
}

// ---------------------------------------------------------------------------
// 3. Derived metrics
// ---------------------------------------------------------------------------

export type PriceBand = "cheaper" | "average" | "pricier" | "unknown";

export interface ShopMetrics {
  shop: Shop;
  /** $/hr labor rate, or null when no timed labor. */
  laborRate: number | null;
  avgInvoice: number;
  /**
   * Weighted price index vs fleet-wide medians (1.0 = at the median,
   * 0.9 = 10% cheaper, 1.2 = 20% pricier). Null when nothing comparable.
   */
  indexFleet: number | null;
  /** Same, but compared only to shops within the "nearby" radius. */
  indexNearby: number | null;
  /** Shops within the nearby radius that had comparable work. */
  nearbyCount: number;
  /** When a task filter is active: this shop's avg for that task. */
  taskAvg: number | null;
  taskCount: number;
  band: PriceBand;
  /** Display label drawn on the pin. */
  pinLabel: string;
}

export interface Settings {
  lookbackMonths: number;
  nearbyRadiusMi: number;
  /** "" = all tasks (weighted index), otherwise a task name. */
  task: string;
  /** Compare against fleet-wide medians ("fleet") or nearby shops only ("nearby"). */
  compareTo: "nearby" | "fleet";
  onlyInView: boolean;
  proxyUrl: string;
}

export interface NearestShop {
  metrics: ShopMetrics;
  distanceMi: number;
}

export interface VehicleContext {
  id: string;
  name: string;
  location: ILocation;
  nearest: NearestShop[];
}
