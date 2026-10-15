import { useMemo, useState } from "react";
import { Button, Dropdown, EmptyState, type ISelectionItem } from "@geotab/zenith";
import { chosenIndex } from "../data/metrics";
import { bandColor } from "../map/pin";
import type { Settings, ShopMetrics } from "../types";
import { formatDate, formatInt, money, pct } from "../utils/format";

interface ShopListProps {
  metrics: ShopMetrics[];
  settings: Settings;
  hoverId: number | null;
  loading: boolean;
  onSelect(id: number): void;
  onZoom(m: ShopMetrics): void;
}

type SortKey = "price" | "spend" | "visits" | "name" | "recent";

const sortItems: ISelectionItem[] = [
  { id: "price", name: "Sort: cheapest first" },
  { id: "spend", name: "Sort: most spend" },
  { id: "visits", name: "Sort: most visits" },
  { id: "recent", name: "Sort: most recent visit" },
  { id: "name", name: "Sort: name" },
];

export function ShopList({ metrics, settings, hoverId, loading, onSelect, onZoom }: ShopListProps) {
  const [sort, setSort] = useState<SortKey>("price");

  const rows = useMemo(() => {
    const list = [...metrics];
    const idx = (m: ShopMetrics) => chosenIndex(m, settings);
    switch (sort) {
      case "price":
        list.sort((a, b) => {
          const ia = idx(a),
            ib = idx(b);
          if (ia == null && ib == null) return b.shop.spend - a.shop.spend;
          if (ia == null) return 1;
          if (ib == null) return -1;
          return ia - ib;
        });
        break;
      case "spend":
        list.sort((a, b) => b.shop.spend - a.shop.spend);
        break;
      case "visits":
        list.sort((a, b) => b.shop.visits - a.shop.visits);
        break;
      case "recent":
        list.sort((a, b) => (b.shop.lastVisit ?? "").localeCompare(a.shop.lastVisit ?? ""));
        break;
      case "name":
        list.sort((a, b) => a.shop.name.localeCompare(b.shop.name));
        break;
    }
    return list;
  }, [metrics, settings, sort]);

  if (loading && !metrics.length) {
    return <p className="gsp-muted">Loading shop history…</p>;
  }
  if (!metrics.length) {
    return (
      <EmptyState description={settings.onlyInView ? "Pan or zoom the map, or untick “Only shops in view”." : "No service vendors with coordinates were found for this look-back."}>
        No shops to show
      </EmptyState>
    );
  }

  return (
    <div className="gsp-list">
      <div className="gsp-list-head">
        <span className="gsp-muted">
          {formatInt(rows.length)} shop{rows.length === 1 ? "" : "s"}
          {settings.task ? ` · ${settings.task}` : ""}
        </span>
        <Dropdown
          value={[sort]}
          dataItems={sortItems}
          onChange={(items: ISelectionItem[]) => {
            const id = items[0]?.id;
            if (id) setSort(String(id) as SortKey);
          }}
          errorHandler={(e) => console.error("[ShopPrices] sort:", e)}
          forceSelection
          multiselect={false}
          showSelection
          showCounterPill={false}
          placeholder="Sort"
        />
      </div>
      <ul className="gsp-rows" data-testid="shop-rows">
        {rows.map((m) => {
          const idx = chosenIndex(m, settings);
          return (
            <li
              key={m.shop.id}
              className={`gsp-row${hoverId === m.shop.id ? " gsp-row-hover" : ""}`}
              data-shop-id={m.shop.id}
              onClick={() => onSelect(m.shop.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(m.shop.id);
              }}
            >
              <span className="gsp-band" style={{ background: bandColor(m.band) }} aria-hidden />
              <div className="gsp-row-main">
                <div className="gsp-row-title">
                  <strong>{m.shop.name}</strong>
                  {m.shop.labels.map((l) => (
                    <span key={l} className="gsp-chip">
                      {l}
                    </span>
                  ))}
                </div>
                <div className="gsp-row-sub gsp-muted">
                  {m.shop.city}, {m.shop.region} · {formatInt(m.shop.visits)} visits · {money(m.shop.spend)} · last{" "}
                  {formatDate(m.shop.lastVisit)}
                </div>
              </div>
              <div className="gsp-row-price">
                <span className="gsp-price" style={{ color: bandColor(m.band) }}>
                  {settings.task ? (m.taskAvg != null ? money(m.taskAvg) : "—") : idx != null ? pct(idx) : "—"}
                </span>
                <span className="gsp-muted gsp-price-sub">
                  {settings.task
                    ? idx != null
                      ? `${pct(idx)} ${settings.compareTo === "nearby" ? "nearby" : "fleet"}`
                      : "no comparison"
                    : m.laborRate != null
                      ? `${money(m.laborRate)}/hr`
                      : "no labor time"}
                </span>
              </div>
              <Button
                type="tertiary"
                title="Zoom map to this shop"
                onClick={(e) => {
                  e.stopPropagation();
                  onZoom(m);
                }}
              >
                ⌖
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
