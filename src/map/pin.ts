import { BRAND } from "../config";
import type { PriceBand } from "../types";

export const PIN_HEIGHT = 34;
const TAG_HEIGHT = 24;
const CHAR_W = 7.2;
const PAD = 18;

export function bandColor(band: PriceBand): string {
  switch (band) {
    case "cheaper":
      return BRAND.green;
    case "pricier":
      return BRAND.red;
    case "average":
      return BRAND.amber;
    default:
      return BRAND.grey;
  }
}

export function bandLabel(band: PriceBand): string {
  switch (band) {
    case "cheaper":
      return "Below median";
    case "pricier":
      return "Above median";
    case "average":
      return "Around median";
    default:
      return "No comparison";
  }
}

export function pinWidth(label: string): number {
  return Math.max(46, Math.round(label.length * CHAR_W + PAD));
}

/**
 * A price-tag shaped pin (rounded label + pointer) as a data: URI SVG, which
 * is what service.canvas.marker accepts as its `source`.
 */
export function pinSvg(label: string, band: PriceBand, selected: boolean, preferred: boolean): { href: string; width: number; height: number } {
  const width = pinWidth(label);
  const height = PIN_HEIGHT;
  const fill = bandColor(band);
  const stroke = selected ? BRAND.navy : "#ffffff";
  const sw = selected ? 3 : 1.5;
  const cx = width / 2;
  const tagBottom = TAG_HEIGHT;
  const path = [
    `M6,0.75 H${width - 6}`,
    `a5.25,5.25 0 0 1 5.25,5.25`,
    `V${tagBottom - 5.25}`,
    `a5.25,5.25 0 0 1 -5.25,5.25`,
    `H${cx + 6}`,
    `L${cx},${height - 1}`,
    `L${cx - 6},${tagBottom}`,
    `H6`,
    `a5.25,5.25 0 0 1 -5.25,-5.25`,
    `V6`,
    `a5.25,5.25 0 0 1 5.25,-5.25`,
    `Z`,
  ].join(" ");
  const star = preferred
    ? `<text x="${width - 9}" y="9" font-size="9" fill="#ffd166" font-family="Arial" text-anchor="middle">★</text>`
    : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    `<text x="${cx}" y="${tagBottom / 2 + 4.5}" font-family="Roboto, Arial, sans-serif" font-size="12" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(label)}</text>` +
    star +
    `</svg>`;
  return { href: `data:image/svg+xml;base64,${toBase64(svg)}`, width, height };
}

export function vehicleSvg(): { href: string; width: number; height: number } {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">` +
    `<circle cx="14" cy="14" r="12" fill="${BRAND.blue}" stroke="#fff" stroke-width="2.5"/>` +
    `<path d="M7 17v-5a1 1 0 0 1 1-1h7l3 3h2a1 1 0 0 1 1 1v2h-2a2 2 0 0 1-4 0h-4a2 2 0 0 1-4 0Z" fill="#fff"/>` +
    `</svg>`;
  return { href: `data:image/svg+xml;base64,${toBase64(svg)}`, width: 28, height: 28 };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toBase64(s: string): string {
  // btoa needs latin1; encode UTF-8 first (labels can contain "−" and "★").
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
