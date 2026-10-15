import { useState } from "react";
import { Button, Dropdown, TextInputRaw, type ISelectionItem } from "@geotab/zenith";
import type { Settings } from "../types";

interface SettingsPanelProps {
  settings: Settings;
  onChange(patch: Partial<Settings>): void;
  onReload(): void;
}

const lookbackItems: ISelectionItem[] = [3, 6, 12, 24, 36].map((m) => ({ id: String(m), name: `Look back: ${m} months` }));

export function SettingsPanel({ settings, onChange, onReload }: SettingsPanelProps) {
  const [url, setUrl] = useState(settings.proxyUrl);
  const dirty = url.trim() !== settings.proxyUrl;

  return (
    <div className="gsp-settings">
      <h4>Data</h4>
      <Dropdown
        value={[String(settings.lookbackMonths)]}
        dataItems={lookbackItems}
        onChange={(items: ISelectionItem[]) => {
          const id = items[0]?.id;
          if (id != null) onChange({ lookbackMonths: parseInt(String(id), 10) });
        }}
        errorHandler={(e) => console.error("[ShopPrices] lookback:", e)}
        forceSelection
        multiselect={false}
        showSelection
        showCounterPill={false}
        placeholder="Look back"
      />

      <label className="gsp-field">
        <span>Fleetio proxy URL</span>
        <TextInputRaw
          value={url}
          placeholder="https://xxxx.lambda-url.us-east-1.on.aws/"
          onChange={(e) => setUrl(e.target.value)}
          ariaLabel="Fleetio proxy URL"
        />
        <small className="gsp-muted">
          The proxy (see <code>proxy/</code> in the repo) validates your MyGeotab session, then reads vendors and
          service entries from the Fleetio account mapped to this database. Leave blank for demo data.
        </small>
      </label>
      <div className="gsp-actions">
        <Button
          type="primary"
          disabled={!dirty}
          onClick={() => {
            onChange({ proxyUrl: url.trim() });
          }}
        >
          Save URL
        </Button>
        <Button type="secondary" onClick={onReload}>
          Clear cache &amp; reload
        </Button>
      </div>

      <h4>How prices are compared</h4>
      <p className="gsp-small">
        Each shop's average cost per service (from Fleetio service-entry line items) is divided by the median of other
        shops' averages for the same service. Those ratios are weighted by how often the service was done to give one
        index per shop: <strong>−12%</strong> means the shop charged 12% less than the median for the same mix of work.
        "Nearby" uses only shops inside the radius; "fleet" uses every shop in the dataset. Labor rate is labor $ divided
        by hours, counting only invoices where the shop recorded labor time.
      </p>
      <p className="gsp-small gsp-muted">
        Pins: green ≤ −5%, amber within ±5%, red ≥ +5%, grey when there is nothing comparable. ★ marks vendors labelled
        Preferred / Approved / Contract in Fleetio.
      </p>
    </div>
  );
}
