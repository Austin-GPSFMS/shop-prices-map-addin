/**
 * Price metrics.
 *
 * The honest way to compare shops is like-for-like: an oil change at shop A
 * versus an oil change at shop B. So every comparison is built from
 * per-service-task averages and only then rolled up:
 *
 *   taskAvg(shop, task)   = tasks[task].total / tasks[task].count
 *   median(task, pool)    = median of taskAvg over the shops in the pool
 *   index(shop, pool)     = Σ count_t · (taskAvg_t / median_t) / Σ count_t
 *
 * where the pool is either every shop in the dataset ("fleet") or the shops
 * within `nearbyRadiusMi` of the shop being scored ("nearby"). An index of
 * 0.88 reads as "12% cheaper than the comparison median for the same work".
 * When a single task is selected the index collapses to that one task.
 */

import { BAND_TOLERANCE } from "../config";
import type { ILocation, NearestShop, PriceBand, Settings, Shop, ShopDataset, ShopMetrics } from "../types";
import { haversineMi } from "../utils/geo";
import { median, money, pct } from "../utils/format";

function taskAvg(shop: Shop, task: string): number | null {
  const st = shop.tasks[task];
  if (!st || st.count <= 0) return null;
  return st.total / st.count;
}

/** Median per task over a pool of shops; tasks seen at fewer than `minShops` shops are dropped. */
function taskMedians(pool: Shop[], tasks: string[], minShops: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of tasks) {
    const vals: number[] = [];
    for (const s of pool) {
      const a = taskAvg(s, t);
      if (a != null) vals.push(a);
    }
    if (vals.length >= minShops) {
      const m = median(vals);
      if (m != null && m > 0) out.set(t, m);
    }
  }
  return out;
}

function indexAgainst(shop: Shop, medians: Map<string, number>, task: string): number | null {
  if (task) {
    const a = taskAvg(shop, task);
    const m = medians.get(task);
    return a != null && m ? a / m : null;
  }
  let num = 0,
    den = 0;
  for (const [t, m] of medians) {
    const st = shop.tasks[t];
    if (!st || st.count <= 0) continue;
    const a = st.total / st.count;
    num += st.count * (a / m);
    den += st.count;
  }
  return den > 0 ? num / den : null;
}

function bandFor(ratio: number | null): PriceBand {
  if (ratio == null) return "unknown";
  if (ratio <= 1 - BAND_TOLERANCE) return "cheaper";
  if (ratio >= 1 + BAND_TOLERANCE) return "pricier";
  return "average";
}

export function computeMetrics(dataset: ShopDataset, settings: Settings): ShopMetrics[] {
  const shops = dataset.shops;
  const tasks = settings.task ? [settings.task] : dataset.tasks;
  const fleetMedians = taskMedians(shops, tasks, 2);

  return shops.map((shop) => {
    const here: ILocation = { lat: shop.lat, lng: shop.lng };
    const neighbours = shops.filter((o) => o.id !== shop.id && haversineMi(here, { lat: o.lat, lng: o.lng }) <= settings.nearbyRadiusMi);
    // Nearby pool = the neighbours only (not the shop itself) so a shop with one
    // neighbour is compared against that neighbour, not against itself.
    const nearbyMedians = taskMedians(neighbours, tasks, 1);
    const indexFleet = indexAgainst(shop, fleetMedians, settings.task);
    const indexNearby = indexAgainst(shop, nearbyMedians, settings.task);
    const nearbyCount = neighbours.filter((o) => [...nearbyMedians.keys()].some((t) => taskAvg(o, t) != null)).length;

    const chosen = settings.compareTo === "nearby" ? indexNearby : indexFleet;
    const tAvg = settings.task ? taskAvg(shop, settings.task) : null;
    const tCount = settings.task ? (shop.tasks[settings.task]?.count ?? 0) : 0;

    let pinLabel: string;
    if (settings.task) pinLabel = tAvg != null ? money(tAvg) : "n/a";
    else pinLabel = chosen != null ? pct(chosen) : "n/a";

    const laborRate = shop.laborHours > 0 ? shop.laborSpendTimed / shop.laborHours : null;

    return {
      shop,
      laborRate,
      avgInvoice: shop.visits > 0 ? shop.spend / shop.visits : 0,
      indexFleet,
      indexNearby,
      nearbyCount,
      taskAvg: tAvg,
      taskCount: tCount,
      band: settings.task && tAvg == null ? "unknown" : bandFor(chosen),
      pinLabel,
    };
  });
}

export function chosenIndex(m: ShopMetrics, settings: Settings): number | null {
  return settings.compareTo === "nearby" ? m.indexNearby : m.indexFleet;
}

/** Shops ranked for a vehicle: nearest first, but a cheaper shop a little further out wins. */
export function nearestShops(from: ILocation, metrics: ShopMetrics[], settings: Settings, n = 5): NearestShop[] {
  const scored = metrics
    .map((m) => ({ metrics: m, distanceMi: haversineMi(from, { lat: m.shop.lat, lng: m.shop.lng }) }))
    .filter((x) => !settings.task || x.metrics.taskAvg != null);
  // Score = distance penalised by price index: each 10% above median costs ~5 miles.
  const score = (x: NearestShop) => {
    const idx = chosenIndex(x.metrics, settings) ?? 1;
    return x.distanceMi + (idx - 1) * 50;
  };
  return scored.sort((a, b) => score(a) - score(b)).slice(0, n);
}

export interface TaskRow {
  task: string;
  count: number;
  avg: number;
  min: number;
  max: number;
  laborShare: number;
  /** Median of other shops' averages (nearby pool / fleet pool); null when nobody else did it. */
  medianNearby: number | null;
  medianFleet: number | null;
}

/** Per-task table for one shop, with the comparison medians the index is built from. */
export function taskBreakdown(shop: Shop, all: Shop[], settings: Settings): TaskRow[] {
  const here: ILocation = { lat: shop.lat, lng: shop.lng };
  const others = all.filter((o) => o.id !== shop.id);
  const neighbours = others.filter((o) => haversineMi(here, { lat: o.lat, lng: o.lng }) <= settings.nearbyRadiusMi);
  const tasks = Object.keys(shop.tasks);
  const nearby = taskMedians(neighbours, tasks, 1);
  const fleet = taskMedians(others, tasks, 1);
  return tasks
    .map((t) => {
      const st = shop.tasks[t];
      return {
        task: t,
        count: st.count,
        avg: st.total / st.count,
        min: st.min,
        max: st.max,
        laborShare: st.total > 0 ? st.labor / st.total : 0,
        medianNearby: nearby.get(t) ?? null,
        medianFleet: fleet.get(t) ?? null,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/** Fleet-wide roll-up for the summary tiles. */
export function summarise(metrics: ShopMetrics[]) {
  let spend = 0,
    visits = 0,
    laborHours = 0,
    laborTimed = 0;
  for (const m of metrics) {
    spend += m.shop.spend;
    visits += m.shop.visits;
    laborHours += m.shop.laborHours;
    laborTimed += m.shop.laborSpendTimed;
  }
  const cheaper = metrics.filter((m) => m.band === "cheaper").length;
  const pricier = metrics.filter((m) => m.band === "pricier").length;
  return {
    shops: metrics.length,
    spend,
    visits,
    avgLaborRate: laborHours > 0 ? laborTimed / laborHours : null,
    cheaper,
    pricier,
  };
}

/** Potential saving if visits to "pricier" shops had been done at the comparison median. */
export function estimatedOverspend(metrics: ShopMetrics[], settings: Settings): number {
  let over = 0;
  for (const m of metrics) {
    const idx = chosenIndex(m, settings);
    if (idx == null || idx <= 1) continue;
    const base = settings.task ? (m.shop.tasks[settings.task]?.total ?? 0) : m.shop.spend;
    over += base - base / idx;
  }
  return over;
}
