/**
 * Dataset loading.
 *
 * Order of preference:
 *   1. cached dataset in service.localStorage (fresh within CACHE_TTL_MS)
 *   2. the Fleetio proxy (POST {database,userName,sessionId,domain,lookbackMonths})
 *   3. the bundled mock dataset (always available; flagged in the UI)
 *
 * The proxy validates the MyGeotab session server-side before it touches
 * Fleetio, so no Fleetio credential ever reaches the browser.
 */

import type { IMapAddInService, ShopDataset } from "../types";
import { buildMockDataset } from "./mock";
import { cacheKeyFor, loadCachedDataset, saveCachedDataset } from "../utils/storage";

export interface LoadResult {
  dataset: ShopDataset;
  fromCache: boolean;
  /** Set when the proxy was configured but failed and we fell back to mock. */
  proxyError?: string;
}

export async function loadDataset(
  service: IMapAddInService,
  proxyUrl: string,
  lookbackMonths: number,
  opts: { force?: boolean } = {}
): Promise<LoadResult> {
  const url = proxyUrl.trim();
  if (!url) {
    return { dataset: buildMockDataset(lookbackMonths), fromCache: false };
  }

  let session: { database: string; userName: string; sessionId: string; domain: string } | null = null;
  try {
    session = await service.api.getSession();
  } catch (e) {
    console.warn("[ShopPrices] getSession failed:", e);
  }
  const database = session?.database ?? "unknown";
  const key = cacheKeyFor(url, lookbackMonths, database);

  if (!opts.force) {
    const cached = await loadCachedDataset(service, key);
    if (cached) return { dataset: cached, fromCache: true };
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...session, lookbackMonths }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Proxy HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
    }
    const dataset = (await res.json()) as ShopDataset;
    if (!Array.isArray(dataset.shops)) throw new Error("Proxy response missing `shops`");
    dataset.source = "fleetio";
    await saveCachedDataset(service, key, dataset);
    return { dataset, fromCache: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ShopPrices] proxy failed, using mock:", msg);
    return { dataset: buildMockDataset(lookbackMonths), fromCache: false, proxyError: msg };
  }
}
