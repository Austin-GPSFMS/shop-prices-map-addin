import { Banner, Button, EmptyState } from "@geotab/zenith";
import { chosenIndex } from "../data/metrics";
import { bandColor } from "../map/pin";
import type { Settings, VehicleContext } from "../types";
import { formatInt, miles, money, pct } from "../utils/format";

interface VehiclePanelProps {
  vehicle: VehicleContext | null;
  busy: boolean;
  error: string | null;
  settings: Settings;
  onSelectShop(id: number): void;
  onClear(): void;
}

export function VehiclePanel({ vehicle, busy, error, settings, onSelectShop, onClear }: VehiclePanelProps) {
  if (busy) return <p className="gsp-muted">Finding the best shops…</p>;
  if (error) {
    return (
      <Banner type="error" header="Couldn't rank shops">
        {error}
      </Banner>
    );
  }
  if (!vehicle) {
    return (
      <EmptyState description="Right-click a vehicle on the map and choose “Nearest shops by price”, or right-click anywhere on the map for “Shops near here by price”.">
        Pick a vehicle
      </EmptyState>
    );
  }
  return (
    <div className="gsp-vehicle" data-testid="vehicle-panel">
      <div className="gsp-detail-nav">
        <div>
          <h3>{vehicle.name}</h3>
          <div className="gsp-muted gsp-small">
            {vehicle.location.lat.toFixed(4)}, {vehicle.location.lng.toFixed(4)}
            {settings.task ? ` · ${settings.task}` : " · all services"}
          </div>
        </div>
        <Button type="tertiary" onClick={onClear}>
          Clear
        </Button>
      </div>
      <p className="gsp-muted gsp-small">
        Ranked by distance with a price penalty (every 10% above the {settings.compareTo} median counts as ~5 extra miles).
      </p>
      <ol className="gsp-rank">
        {vehicle.nearest.map((n, i) => {
          const m = n.metrics;
          const idx = chosenIndex(m, settings);
          return (
            <li key={m.shop.id} className="gsp-row" onClick={() => onSelectShop(m.shop.id)} role="button" tabIndex={0}>
              <span className="gsp-rank-no">{i + 1}</span>
              <span className="gsp-band" style={{ background: bandColor(m.band) }} aria-hidden />
              <div className="gsp-row-main">
                <div className="gsp-row-title">
                  <strong>{m.shop.name}</strong>
                </div>
                <div className="gsp-row-sub gsp-muted">
                  {miles(n.distanceMi)} · {m.shop.city} · {formatInt(m.shop.visits)} visits
                  {m.laborRate != null ? ` · ${money(m.laborRate)}/hr` : ""}
                </div>
              </div>
              <div className="gsp-row-price">
                <span className="gsp-price" style={{ color: bandColor(m.band) }}>
                  {settings.task && m.taskAvg != null ? money(m.taskAvg) : pct(idx)}
                </span>
                <span className="gsp-muted gsp-price-sub">{settings.task && m.taskAvg != null ? pct(idx) : "index"}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
