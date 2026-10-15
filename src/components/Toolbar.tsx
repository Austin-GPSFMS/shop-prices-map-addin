import { Checkbox, Dropdown, type ISelectionItem } from "@geotab/zenith";
import type { Settings } from "../types";

interface ToolbarProps {
  settings: Settings;
  tasks: string[];
  onChange(patch: Partial<Settings>): void;
  showPins: boolean;
  onTogglePins(v: boolean): void;
}

const ALL_TASKS_ID = "__all__";

const compareItems: ISelectionItem[] = [
  { id: "nearby", name: "Compare: nearby shops" },
  { id: "fleet", name: "Compare: whole fleet" },
];

const radiusItems: ISelectionItem[] = [10, 25, 50, 100].map((r) => ({ id: String(r), name: `Nearby radius: ${r} mi` }));

export function Toolbar({ settings, tasks, onChange, showPins, onTogglePins }: ToolbarProps) {
  const taskItems: ISelectionItem[] = [
    { id: ALL_TASKS_ID, name: "All services (weighted index)" },
    ...tasks.map((t) => ({ id: t, name: t })),
  ];
  return (
    <div className="gsp-toolbar">
      <Dropdown
        value={[settings.task || ALL_TASKS_ID]}
        dataItems={taskItems}
        onChange={(items: ISelectionItem[]) => {
          const id = items[0]?.id;
          onChange({ task: id == null || id === ALL_TASKS_ID ? "" : String(id) });
        }}
        errorHandler={(e) => console.error("[ShopPrices] task:", e)}
        forceSelection
        multiselect={false}
        showSelection
        showCounterPill={false}
        placeholder="Service"
      />
      <div className="gsp-toolbar-row">
        <Dropdown
          value={[settings.compareTo]}
          dataItems={compareItems}
          onChange={(items: ISelectionItem[]) => {
            const id = items[0]?.id;
            if (id === "nearby" || id === "fleet") onChange({ compareTo: id });
          }}
          errorHandler={(e) => console.error("[ShopPrices] compare:", e)}
          forceSelection
          multiselect={false}
          showSelection
          showCounterPill={false}
          placeholder="Compare to"
        />
        <Dropdown
          value={[String(settings.nearbyRadiusMi)]}
          dataItems={radiusItems}
          onChange={(items: ISelectionItem[]) => {
            const id = items[0]?.id;
            if (id != null) onChange({ nearbyRadiusMi: parseInt(String(id), 10) });
          }}
          errorHandler={(e) => console.error("[ShopPrices] radius:", e)}
          forceSelection
          multiselect={false}
          showSelection
          showCounterPill={false}
          placeholder="Radius"
        />
      </div>
      <div className="gsp-toolbar-row gsp-checks">
        <label className="gsp-check">
          <Checkbox checked={settings.onlyInView} ariaLabel="Only shops in view" onChange={(e) => onChange({ onlyInView: e.target.checked })} />
          <span>Only shops in view</span>
        </label>
        <label className="gsp-check">
          <Checkbox checked={showPins} ariaLabel="Show pins on map" onChange={(e) => onTogglePins(e.target.checked)} />
          <span>Show pins</span>
        </label>
      </div>
    </div>
  );
}
