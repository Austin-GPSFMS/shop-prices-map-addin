import { CACHE_KEY, CACHE_TTL_MS, DEFAULT_SETTINGS, STORAGE_KEY } from "../config";
import type { IMapAddInService, Settings, ShopDataset } from "../types";

/**
 * Map Add-Ins live in a sandboxed iframe that is thrown away whenever the user
 * leaves the Map page, so anything worth keeping goes through
 * service.localStorage (which MyGeotab persists on our behalf).
 */
export async function loadSettings(service: IMapAddInService): Promise<Settings> {
  try {
    const raw = await service.localStorage.get(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn("[ShopPrices] settings load failed:", e);
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(service: IMapAddInService, settings: Settings): Promise<void> {
  try {
    await service.localStorage.set(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("[ShopPrices] settings save failed:", e);
  }
}

interface CacheEnvelope {
  savedAt: number;
  key: string;
  dataset: ShopDataset;
}

export function cacheKeyFor(proxyUrl: string, lookbackMonths: number, database: string): string {
  return `${database}|${lookbackMonths}|${proxyUrl}`;
}

export async function loadCachedDataset(service: IMapAddInService, key: string): Promise<ShopDataset | null> {
  try {
    const raw = await service.localStorage.get(CACHE_KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope;
    if (env.key !== key) return null;
    if (Date.now() - env.savedAt > CACHE_TTL_MS) return null;
    return env.dataset;
  } catch {
    return null;
  }
}

export async function saveCachedDataset(service: IMapAddInService, key: string, dataset: ShopDataset): Promise<void> {
  try {
    const env: CacheEnvelope = { savedAt: Date.now(), key, dataset };
    await service.localStorage.set(CACHE_KEY, JSON.stringify(env));
  } catch (e) {
    console.warn("[ShopPrices] dataset cache save failed:", e);
  }
}

export async function clearCachedDataset(service: IMapAddInService): Promise<void> {
  try {
    await service.localStorage.remove(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
