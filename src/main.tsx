/**
 * Entry point for the GPSFMS Shop Prices Map Add-In.
 *
 * MyGeotab injects this script into the Map page's add-in iframe and calls
 *   window.geotab.addin.gpsfmsShopPrices(elt, service)
 * the first time the user opens our tab. `elt` is the 450px side-panel
 * element we own; `service` is the Map Add-In API (canvas, events, tooltip,
 * actionList, map, api, localStorage, page).
 *
 * Global names are prefixed `gpsfmsShopPrices` because every installed Map
 * Add-In shares the same iframe scope.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App";
import type { IMapAddInService } from "./types";
import "./styles.css";

declare global {
  interface Window {
    geotab?: {
      addin?: Record<string, (elt: HTMLElement, service: IMapAddInService) => void>;
    };
  }
}

export function gpsfmsShopPricesMount(elt: HTMLElement, service: IMapAddInService) {
  elt.classList.add("gsp-root");
  const root = createRoot(elt);
  root.render(
    <StrictMode>
      <App service={service} />
    </StrictMode>
  );
  return () => root.unmount();
}

/**
 * Registration. MyGeotab's map iframe pre-defines `geotab.addin` as a
 * READ-ONLY property, so `geotab.addin = geotab.addin || {}` throws
 * ("Cannot assign to read only property 'addin'") and MyGeotab then reports
 * "Add-in can't be installed … Can't be loaded" and removes the tab. Only
 * ever assign our own key; create the parents solely when they are missing.
 */
const w = window as Window;
const geotab = w.geotab ?? (w.geotab = {});
const addin = geotab.addin ?? (geotab.addin = {});
addin.gpsfmsShopPrices = (elt, service) => {
  try {
    gpsfmsShopPricesMount(elt, service);
  } catch (e) {
    console.error("[ShopPrices] mount failed:", e);
  }
};
