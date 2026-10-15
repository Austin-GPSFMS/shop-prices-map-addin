import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, Tabs } from "@geotab/zenith";
import { DEFAULT_SETTINGS, EVT_NEAREST_FOR_DEVICE, EVT_NEAREST_HERE } from "../config";
import { loadDataset } from "../data/fetch";
import { computeMetrics, nearestShops } from "../data/metrics";
import { getVehicle } from "../geotab/vehicles";
import { ShopLayer } from "../map/layer";
import type { ILocation, IMapAddInService, IMapBounds, IMenuEventData, Settings, ShopDataset, ShopMetrics, VehicleContext } from "../types";
import { boundsFor, inBounds } from "../utils/geo";
import { clearCachedDataset, loadSettings, saveSettings } from "../utils/storage";
import { formatDate } from "../utils/format";
import { SettingsPanel } from "./SettingsPanel";
import { ShopDetail } from "./ShopDetail";
import { ShopList } from "./ShopList";
import { Summary } from "./Summary";
import { Toolbar } from "./Toolbar";
import { VehiclePanel } from "./VehiclePanel";

interface AppProps {
  service: IMapAddInService;
}

type Tab = "shops" | "vehicle" | "settings";

const TABS = [
  { id: "shops", name: "Shops" },
  { id: "vehicle", name: "Vehicle" },
  { id: "settings", name: "Settings" },
];

export default function App({ service }: AppProps) {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [settingsReady, setSettingsReady] = useState(false);
  const [dataset, setDataset] = useState<ShopDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [bounds, setBounds] = useState<IMapBounds | null>(null);
  const [vehicle, setVehicle] = useState<VehicleContext | null>(null);
  const [vehicleBusy, setVehicleBusy] = useState(false);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("shops");
  const [showPins, setShowPins] = useState(true);

  const layerRef = useRef<ShopLayer | null>(null);
  const metricsRef = useRef<ShopMetrics[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // ---- Settings ----
  useEffect(() => {
    let alive = true;
    loadSettings(service).then((s) => {
      if (!alive) return;
      setSettings(s);
      setSettingsReady(true);
    });
    return () => {
      alive = false;
    };
  }, [service]);

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        void saveSettings(service, next);
        return next;
      });
    },
    [service]
  );

  // ---- Dataset ----
  const reload = useCallback(
    async (force = false) => {
      setLoading(true);
      setLoadError(null);
      try {
        if (force) await clearCachedDataset(service);
        const r = await loadDataset(service, settingsRef.current.proxyUrl, settingsRef.current.lookbackMonths, { force });
        setDataset(r.dataset);
        setFromCache(r.fromCache);
        setLoadError(r.proxyError ?? null);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [service]
  );

  useEffect(() => {
    if (!settingsReady) return;
    void reload(false);
    // Re-fetch only when the inputs that change the server-side dataset change.
  }, [settingsReady, settings.proxyUrl, settings.lookbackMonths, reload]);

  // ---- Metrics ----
  const metrics = useMemo(() => (dataset ? computeMetrics(dataset, settings) : []), [dataset, settings]);
  metricsRef.current = metrics;

  // ---- Map layer ----
  useEffect(() => {
    const layer = new ShopLayer(service, {
      onSelect: (id) => {
        setSelectedId(id);
        setTab("shops");
      },
      onHover: (id) => setHoverId(id),
    });
    layerRef.current = layer;
    return () => {
      layer.destroy();
      layerRef.current = null;
    };
  }, [service]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.render(showPins ? metrics : [], selectedId, settings.compareTo);
  }, [metrics, selectedId, settings.compareTo, showPins]);

  // Radius ring around the selected shop (only meaningful in "nearby" mode).
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    if (vehicle) return; // vehicle links own the extras layer while shown
    layer.clearExtras();
    if (selectedId != null && settings.compareTo === "nearby") {
      const m = metrics.find((x) => x.shop.id === selectedId);
      if (m) layer.drawRadius({ lat: m.shop.lat, lng: m.shop.lng }, settings.nearbyRadiusMi);
    }
  }, [selectedId, settings.compareTo, settings.nearbyRadiusMi, metrics, vehicle]);

  // ---- Map viewport ----
  useEffect(() => {
    const onChanged = (v: { bounds?: IMapBounds }) => {
      if (v?.bounds) setBounds(v.bounds);
    };
    service.map.attach("changed", onChanged);
    service.map
      .getBounds()
      .then((b) => setBounds(b))
      .catch(() => undefined);
    return () => service.map.detach("changed", onChanged);
  }, [service]);

  // ---- Action-list menus (vehicle right-click, map right-click) ----
  const runNearest = useCallback(
    async (from: ILocation, id: string, name: string) => {
      setVehicleBusy(true);
      setVehicleError(null);
      try {
        const nearest = nearestShops(from, metricsRef.current, settingsRef.current, 5);
        const ctx: VehicleContext = { id, name, location: from, nearest };
        setVehicle(ctx);
        setTab("vehicle");
        const layer = layerRef.current;
        if (layer) {
          layer.clearExtras();
          layer.drawVehicleLinks(from, nearest);
        }
        const pts = [from, ...nearest.map((n) => ({ lat: n.metrics.shop.lat, lng: n.metrics.shop.lng }))];
        const b = boundsFor(pts, 0.2);
        if (b) await service.map.setBounds(b);
      } catch (e) {
        setVehicleError(e instanceof Error ? e.message : String(e));
      } finally {
        setVehicleBusy(false);
      }
    },
    [service]
  );

  useEffect(() => {
    const deviceMenu = (_name: string, data: IMenuEventData) => [
      {
        title: "Nearest shops by price",
        icon: "",
        clickEvent: EVT_NEAREST_FOR_DEVICE,
        zIndex: 0,
        data: { deviceId: data.device?.id, location: data.location },
      },
    ];
    const mapMenu = (_name: string, data: IMenuEventData) => [
      {
        title: "Shops near here by price",
        icon: "",
        clickEvent: EVT_NEAREST_HERE,
        zIndex: 0,
        data: { location: data.location },
      },
    ];
    const onDevice = async (data: { deviceId?: string; location?: ILocation }) => {
      if (!data?.deviceId) return;
      setVehicleBusy(true);
      setVehicleError(null);
      try {
        const v = await getVehicle(service, data.deviceId);
        const from = v.location ?? data.location;
        if (!from) throw new Error("No position available for this vehicle.");
        await runNearest(from, v.id, v.name);
      } catch (e) {
        setVehicleError(e instanceof Error ? e.message : String(e));
        setVehicleBusy(false);
        setTab("vehicle");
      }
    };
    const onHere = (data: { location?: ILocation }) => {
      if (data?.location) void runNearest(data.location, "", "Map location");
    };
    service.actionList.attachMenu("device", deviceMenu);
    service.actionList.attachMenu("map", mapMenu);
    service.actionList.attach(EVT_NEAREST_FOR_DEVICE, onDevice);
    service.actionList.attach(EVT_NEAREST_HERE, onHere);
    return () => {
      service.actionList.detachMenu("device", deviceMenu);
      service.actionList.detachMenu("map", mapMenu);
      service.actionList.detach(EVT_NEAREST_FOR_DEVICE, onDevice);
      service.actionList.detach(EVT_NEAREST_HERE, onHere);
    };
  }, [service, runNearest]);

  // Hide tooltips while another add-in's tab is active.
  useEffect(() => {
    const onFocus = () => layerRef.current?.setTooltips(true);
    const onBlur = () => layerRef.current?.setTooltips(false);
    service.page.attach("focus", onFocus);
    service.page.attach("blur", onBlur);
    return () => {
      service.page.detach("focus", onFocus);
      service.page.detach("blur", onBlur);
    };
  }, [service]);

  // ---- Derived lists ----
  const visible = useMemo(
    () => (settings.onlyInView ? metrics.filter((m) => inBounds({ lat: m.shop.lat, lng: m.shop.lng }, bounds)) : metrics),
    [metrics, settings.onlyInView, bounds]
  );
  const selected = useMemo(() => metrics.find((m) => m.shop.id === selectedId) ?? null, [metrics, selectedId]);

  const zoomTo = useCallback(
    (m: ShopMetrics) => {
      const b = boundsFor([{ lat: m.shop.lat, lng: m.shop.lng }], 0);
      if (!b) return;
      const pad = 0.08;
      void service.map.setBounds({
        sw: { lat: m.shop.lat - pad, lng: m.shop.lng - pad * 1.3 },
        ne: { lat: m.shop.lat + pad, lng: m.shop.lng + pad * 1.3 },
      });
    },
    [service]
  );

  const fitAll = useCallback(() => {
    const b = boundsFor(metrics.map((m) => ({ lat: m.shop.lat, lng: m.shop.lng })));
    if (b) void service.map.setBounds(b);
  }, [metrics, service]);

  const clearVehicle = useCallback(() => {
    setVehicle(null);
    setVehicleError(null);
    layerRef.current?.clearExtras();
  }, []);

  // ---- Render ----
  return (
    <div className="gsp-panel">
      <header className="gsp-header">
        <div>
          <h2>Shop Prices</h2>
          <p>
            {dataset
              ? dataset.source === "fleetio"
                ? `Fleetio · ${dataset.account ?? ""} · last ${dataset.lookbackMonths} mo${fromCache ? " · cached" : ""}`
                : `Demo data · last ${dataset.lookbackMonths} mo`
              : "Loading…"}
          </p>
        </div>
        <div className="gsp-header-actions">
          <Button type="tertiary" onClick={() => void reload(true)} disabled={loading} title="Refresh from Fleetio">
            Refresh
          </Button>
          <Button type="tertiary" onClick={fitAll} disabled={!metrics.length} title="Fit map to all shops">
            Fit all
          </Button>
        </div>
      </header>

      {loadError && (
        <Banner type="warning" header="Fleetio proxy unavailable — showing demo data" multiline>
          {loadError}
        </Banner>
      )}
      {dataset?.source === "mock" && !loadError && (
        <Banner type="info" header="Demo data" multiline>
          Set the Fleetio proxy URL under Settings to see this fleet's real shop history.
        </Banner>
      )}

      <Tabs tabs={TABS} activeTabId={tab} onTabChange={(id) => setTab(id as Tab)} />

      {tab === "shops" && (
        <>
          <Toolbar
            settings={settings}
            tasks={dataset?.tasks ?? []}
            onChange={updateSettings}
            showPins={showPins}
            onTogglePins={setShowPins}
          />
          {selected ? (
            <ShopDetail
              metrics={selected}
              settings={settings}
              allMetrics={metrics}
              onBack={() => setSelectedId(null)}
              onZoom={() => zoomTo(selected)}
              onSelectTask={(t) => updateSettings({ task: t })}
            />
          ) : (
            <>
              <Summary metrics={visible} settings={settings} />
              <ShopList
                metrics={visible}
                settings={settings}
                hoverId={hoverId}
                loading={loading}
                onSelect={(id) => setSelectedId(id)}
                onZoom={zoomTo}
              />
              {dataset && dataset.unmappedShops.length > 0 && (
                <p className="gsp-muted gsp-footnote">
                  {dataset.unmappedShops.length} vendor{dataset.unmappedShops.length === 1 ? "" : "s"} with invoices have no
                  address/coordinates in Fleetio and aren't on the map:{" "}
                  {dataset.unmappedShops.map((u) => u.name).join(", ")}.
                </p>
              )}
              {dataset && (
                <p className="gsp-muted gsp-footnote">Data as of {formatDate(dataset.generatedAt)}.</p>
              )}
            </>
          )}
        </>
      )}

      {tab === "vehicle" && (
        <VehiclePanel
          vehicle={vehicle}
          busy={vehicleBusy}
          error={vehicleError}
          settings={settings}
          onSelectShop={(id) => {
            setSelectedId(id);
            setTab("shops");
          }}
          onClear={clearVehicle}
        />
      )}

      {tab === "settings" && <SettingsPanel settings={settings} onChange={updateSettings} onReload={() => void reload(true)} />}
    </div>
  );
}
