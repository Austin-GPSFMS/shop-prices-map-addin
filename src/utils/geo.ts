import type { ILocation, IMapBounds } from "../types";

const EARTH_RADIUS_MI = 3958.7613;

export function haversineMi(a: ILocation, b: ILocation): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function inBounds(p: ILocation, b: IMapBounds | null): boolean {
  if (!b) return true;
  const latOk = p.lat >= b.sw.lat && p.lat <= b.ne.lat;
  // Handle bounds that cross the antimeridian.
  const lngOk = b.sw.lng <= b.ne.lng ? p.lng >= b.sw.lng && p.lng <= b.ne.lng : p.lng >= b.sw.lng || p.lng <= b.ne.lng;
  return latOk && lngOk;
}

/** Bounds that contain every point, padded by a fraction of the span. */
export function boundsFor(points: ILocation[], padFrac = 0.15): IMapBounds | null {
  if (!points.length) return null;
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const padLat = Math.max((maxLat - minLat) * padFrac, 0.01);
  const padLng = Math.max((maxLng - minLng) * padFrac, 0.01);
  return {
    sw: { lat: minLat - padLat, lng: minLng - padLng },
    ne: { lat: maxLat + padLat, lng: maxLng + padLng },
  };
}

/** Polygon approximating a circle, in lat/lng — for drawing a radius with canvas.path. */
export function circlePolygon(center: ILocation, radiusMi: number, steps = 48): ILocation[] {
  const out: ILocation[] = [];
  const dLat = radiusMi / 69.0;
  const dLng = radiusMi / (69.0 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    out.push({ lat: center.lat + dLat * Math.sin(t), lng: center.lng + dLng * Math.cos(t) });
  }
  return out;
}
