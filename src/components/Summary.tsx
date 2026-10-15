import { estimatedOverspend, summarise } from "../data/metrics";
import type { Settings, ShopMetrics } from "../types";
import { formatInt, money } from "../utils/format";

interface SummaryProps {
  metrics: ShopMetrics[];
  settings: Settings;
}

/**
 * KPI strip. A plain 3-column grid rather than Zenith's SummaryTileBar, which
 * paginates to two tiles at the 450px map-panel width.
 */
export function Summary({ metrics, settings }: SummaryProps) {
  const s = summarise(metrics);
  const over = estimatedOverspend(metrics, settings);
  return (
    <div className="gsp-summary" role="group" aria-label="Shop summary">
      <div className="gsp-kpi">
        <span className="gsp-kpi-label">Shops</span>
        <span className="gsp-tile-value">{formatInt(s.shops)}</span>
        <span className="gsp-kpi-sub">
          <span className="gsp-dot gsp-dot-green" /> {s.cheaper} · <span className="gsp-dot gsp-dot-red" /> {s.pricier}
        </span>
      </div>
      <div className="gsp-kpi">
        <span className="gsp-kpi-label">Spend</span>
        <span className="gsp-tile-value">{money(s.spend)}</span>
        <span className="gsp-kpi-sub">{formatInt(s.visits)} visits</span>
      </div>
      <div className="gsp-kpi">
        <span className="gsp-kpi-label" title="Labor $ ÷ recorded labor hours, across invoices that logged labor time.">
          Avg labor rate
        </span>
        <span className="gsp-tile-value">{s.avgLaborRate != null ? `${money(s.avgLaborRate)}/hr` : "—"}</span>
        <span className="gsp-kpi-sub">timed invoices</span>
      </div>
      <div
        className={`gsp-kpi gsp-kpi-wide${over > 0 ? " gsp-kpi-warn" : ""}`}
        title="What the above-median shops cost beyond the comparison median for the same work — a rough ceiling on savings from steering work elsewhere."
      >
        <span className="gsp-kpi-label">Spent above the {settings.compareTo} median</span>
        <span className="gsp-tile-value">{money(over)}</span>
        <span className="gsp-kpi-sub">potential saving if that work had been done at median price</span>
      </div>
    </div>
  );
}
