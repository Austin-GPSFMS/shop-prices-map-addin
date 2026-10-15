import { useMemo } from "react";
import { Button } from "@geotab/zenith";
import { taskBreakdown } from "../data/metrics";
import { bandColor, bandLabel } from "../map/pin";
import type { Settings, ShopMetrics } from "../types";
import { formatDate, formatInt, money, pct } from "../utils/format";

interface ShopDetailProps {
  metrics: ShopMetrics;
  settings: Settings;
  allMetrics: ShopMetrics[];
  onBack(): void;
  onZoom(): void;
  onSelectTask(task: string): void;
}

export function ShopDetail({ metrics: m, settings, allMetrics, onBack, onZoom, onSelectTask }: ShopDetailProps) {
  const rows = useMemo(() => taskBreakdown(m.shop, allMetrics.map((x) => x.shop), settings), [m, allMetrics, settings]);
  const shop = m.shop;

  return (
    <div className="gsp-detail" data-testid="shop-detail">
      <div className="gsp-detail-nav">
        <Button type="tertiary" onClick={onBack}>
          ← All shops
        </Button>
        <Button type="secondary" onClick={onZoom}>
          Zoom to shop
        </Button>
      </div>

      <div className="gsp-detail-head">
        <span className="gsp-band gsp-band-lg" style={{ background: bandColor(m.band) }} aria-hidden />
        <div>
          <h3>{shop.name}</h3>
          <div className="gsp-muted">
            {shop.address ? `${shop.address}, ` : ""}
            {shop.city}, {shop.region}
            {shop.phone ? ` · ${shop.phone}` : ""}
          </div>
          <div className="gsp-chips">
            {shop.labels.map((l) => (
              <span key={l} className="gsp-chip">
                {l}
              </span>
            ))}
            {shop.parts && <span className="gsp-chip gsp-chip-soft">Parts</span>}
            {shop.fuel && <span className="gsp-chip gsp-chip-soft">Fuel</span>}
          </div>
        </div>
      </div>

      <dl className="gsp-kpis">
        <div>
          <dt>vs nearby ({formatInt(m.nearbyCount)} shops · {settings.nearbyRadiusMi} mi)</dt>
          <dd style={{ color: m.indexNearby != null ? bandColor(m.band) : undefined }}>{pct(m.indexNearby)}</dd>
        </div>
        <div>
          <dt>vs fleet</dt>
          <dd>{pct(m.indexFleet)}</dd>
        </div>
        <div>
          <dt>Labor rate</dt>
          <dd>{m.laborRate != null ? `${money(m.laborRate)}/hr` : "—"}</dd>
        </div>
        <div>
          <dt>Avg invoice</dt>
          <dd>{money(m.avgInvoice)}</dd>
        </div>
        <div>
          <dt>Visits · vehicles</dt>
          <dd>
            {formatInt(shop.visits)} · {formatInt(shop.vehicles)}
          </dd>
        </div>
        <div>
          <dt>Spend (labor / parts)</dt>
          <dd>
            {money(shop.spend)} <small className="gsp-muted">({money(shop.laborSpend)} / {money(shop.partsSpend)})</small>
          </dd>
        </div>
        <div>
          <dt>First · last visit</dt>
          <dd>
            {formatDate(shop.firstVisit)} · {formatDate(shop.lastVisit)}
          </dd>
        </div>
        <div>
          <dt>Price band</dt>
          <dd>{bandLabel(m.band)}</dd>
        </div>
      </dl>

      <h4>Cost by service</h4>
      <p className="gsp-muted gsp-small">
        Average per line item at this shop, against the median of other shops' averages for the same service. Click a
        service to filter the whole map to it.
      </p>
      <table className="gsp-table">
        <thead>
          <tr>
            <th>Service</th>
            <th className="num">#</th>
            <th className="num">Avg</th>
            <th className="num">Nearby</th>
            <th className="num">Fleet</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ratioN = r.medianNearby ? r.avg / r.medianNearby : null;
            const ratioF = r.medianFleet ? r.avg / r.medianFleet : null;
            return (
              <tr key={r.task} className={settings.task === r.task ? "gsp-tr-active" : undefined} onClick={() => onSelectTask(settings.task === r.task ? "" : r.task)}>
                <td>
                  {r.task}
                  <span className="gsp-muted gsp-small"> · {Math.round(r.laborShare * 100)}% labor</span>
                </td>
                <td className="num">{r.count}</td>
                <td className="num">{money(r.avg)}</td>
                <td className="num" style={{ color: ratioN != null ? colorFor(ratioN) : undefined }}>
                  {ratioN != null ? pct(ratioN) : "—"}
                </td>
                <td className="num" style={{ color: ratioF != null ? colorFor(ratioF) : undefined }}>
                  {ratioF != null ? pct(ratioF) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h4>Recent invoices</h4>
      <table className="gsp-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Vehicle</th>
            <th>Work</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {shop.invoices.slice(0, 12).map((inv) => (
            <tr key={inv.id}>
              <td>{formatDate(inv.date)}</td>
              <td>{inv.vehicle}</td>
              <td className="gsp-ellipsis" title={inv.tasks.join(", ")}>
                {inv.url ? (
                  <a href={inv.url} target="_blank" rel="noreferrer">
                    {inv.tasks.join(", ") || inv.reference || `#${inv.id}`}
                  </a>
                ) : (
                  inv.tasks.join(", ") || inv.reference || `#${inv.id}`
                )}
              </td>
              <td className="num">{money(inv.total, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function colorFor(ratio: number): string {
  if (ratio <= 0.95) return bandColor("cheaper");
  if (ratio >= 1.05) return bandColor("pricier");
  return bandColor("average");
}
