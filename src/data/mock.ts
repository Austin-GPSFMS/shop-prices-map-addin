/**
 * Deterministic synthetic dataset so the add-in can be demoed/tested without a
 * Fleetio account. Shaped exactly like the proxy's response (see
 * proxy/lambda_function.py → build_dataset) so swapping sources is seamless.
 *
 * Geography: Central Florida (Tampa / Lakeland / Orlando) plus a few shops in
 * Jacksonville so "nearby" comparisons have real distance structure.
 */

import type { InvoiceSummary, Shop, ShopDataset, TaskStat } from "../types";

/** Small seeded PRNG (mulberry32) — same data every load. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TaskDef {
  name: string;
  base: number;
  laborShare: number;
  hours: number;
  weight: number;
}

const TASKS: TaskDef[] = [
  { name: "Preventive Maintenance (PM-A)", base: 340, laborShare: 0.55, hours: 2.0, weight: 18 },
  { name: "Engine Oil & Filter Change", base: 215, laborShare: 0.45, hours: 1.0, weight: 16 },
  { name: "Brake Pads & Rotors – Front", base: 790, laborShare: 0.4, hours: 2.5, weight: 7 },
  { name: "Brake Inspection", base: 115, laborShare: 0.9, hours: 0.8, weight: 6 },
  { name: "Tire Replacement", base: 525, laborShare: 0.2, hours: 1.0, weight: 9 },
  { name: "Tire Rotation", base: 85, laborShare: 0.95, hours: 0.6, weight: 7 },
  { name: "DOT Annual Inspection", base: 150, laborShare: 1.0, hours: 1.2, weight: 8 },
  { name: "A/C Service", base: 410, laborShare: 0.6, hours: 1.8, weight: 4 },
  { name: "Battery Replacement", base: 290, laborShare: 0.25, hours: 0.5, weight: 5 },
  { name: "Hydraulic Hose Repair", base: 640, laborShare: 0.5, hours: 3.0, weight: 4 },
  { name: "Transmission Service", base: 560, laborShare: 0.5, hours: 2.2, weight: 3 },
  { name: "DEF / Aftertreatment Repair", base: 920, laborShare: 0.55, hours: 3.5, weight: 3 },
  { name: "Wheel Alignment", base: 180, laborShare: 0.9, hours: 1.0, weight: 4 },
  { name: "Wiper Blades", base: 45, laborShare: 0.3, hours: 0.2, weight: 3 },
];

interface ShopSeed {
  name: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  factor: number; // 1.0 = at market
  laborRate: number;
  volume: number; // approx visits / 12 months
  labels?: string[];
}

const SHOPS: ShopSeed[] = [
  // Tampa Bay
  { name: "Bay Area Truck Service", city: "Tampa", region: "FL", lat: 27.9881, lng: -82.4032, factor: 0.9, laborRate: 118, volume: 52, labels: ["Preferred"] },
  { name: "Gulf Coast Diesel & Fleet", city: "Tampa", region: "FL", lat: 27.9343, lng: -82.3482, factor: 1.12, laborRate: 148, volume: 31 },
  { name: "Westshore Fleet Repair", city: "Tampa", region: "FL", lat: 27.9522, lng: -82.5203, factor: 0.97, laborRate: 125, volume: 24 },
  { name: "Brandon Heavy Truck Center", city: "Brandon", region: "FL", lat: 27.9378, lng: -82.2859, factor: 1.05, laborRate: 139, volume: 19 },
  { name: "Suncoast Tire & Alignment", city: "Tampa", region: "FL", lat: 28.0212, lng: -82.4502, factor: 0.85, laborRate: 105, volume: 27, labels: ["Tires"] },
  { name: "Pinellas Fleet Maintenance", city: "Clearwater", region: "FL", lat: 27.9659, lng: -82.7407, factor: 1.0, laborRate: 130, volume: 16 },
  { name: "St. Pete Truck & Trailer", city: "St. Petersburg", region: "FL", lat: 27.7676, lng: -82.6403, factor: 1.18, laborRate: 155, volume: 12 },
  { name: "Plant City Diesel Works", city: "Plant City", region: "FL", lat: 28.0186, lng: -82.1129, factor: 0.82, laborRate: 98, volume: 14 },
  // Lakeland / Polk
  { name: "Polk County Fleet Services", city: "Lakeland", region: "FL", lat: 28.0395, lng: -81.9498, factor: 0.93, laborRate: 112, volume: 22 },
  { name: "Lakeland Truck Pros", city: "Lakeland", region: "FL", lat: 28.0781, lng: -81.9612, factor: 1.08, laborRate: 142, volume: 15 },
  { name: "Winter Haven Auto & Truck", city: "Winter Haven", region: "FL", lat: 28.0222, lng: -81.7329, factor: 1.0, laborRate: 128, volume: 9 },
  // Orlando
  { name: "Orlando Commercial Truck Repair", city: "Orlando", region: "FL", lat: 28.5383, lng: -81.3792, factor: 1.1, laborRate: 150, volume: 38 },
  { name: "Central Florida Fleet Care", city: "Orlando", region: "FL", lat: 28.4813, lng: -81.4336, factor: 0.88, laborRate: 115, volume: 41, labels: ["Preferred"] },
  { name: "I-4 Diesel Service", city: "Sanford", region: "FL", lat: 28.8029, lng: -81.2731, factor: 0.95, laborRate: 122, volume: 18 },
  { name: "Kissimmee Truck & Equipment", city: "Kissimmee", region: "FL", lat: 28.3047, lng: -81.4165, factor: 1.22, laborRate: 160, volume: 11 },
  { name: "Apopka Fleet Garage", city: "Apopka", region: "FL", lat: 28.6762, lng: -81.5119, factor: 0.9, laborRate: 110, volume: 13 },
  { name: "East Orlando Tire Center", city: "Orlando", region: "FL", lat: 28.5479, lng: -81.2443, factor: 0.86, laborRate: 100, volume: 17, labels: ["Tires"] },
  // Daytona / Space Coast
  { name: "Volusia Heavy Duty", city: "Daytona Beach", region: "FL", lat: 29.2108, lng: -81.0228, factor: 1.03, laborRate: 135, volume: 10 },
  { name: "Space Coast Fleet Repair", city: "Melbourne", region: "FL", lat: 28.0836, lng: -80.6081, factor: 1.15, laborRate: 152, volume: 8 },
  // Jacksonville
  { name: "First Coast Truck Service", city: "Jacksonville", region: "FL", lat: 30.3322, lng: -81.6557, factor: 0.92, laborRate: 120, volume: 29 },
  { name: "Jax Diesel & Hydraulics", city: "Jacksonville", region: "FL", lat: 30.2881, lng: -81.7398, factor: 1.09, laborRate: 146, volume: 21 },
  { name: "Northside Fleet Maintenance", city: "Jacksonville", region: "FL", lat: 30.4064, lng: -81.6703, factor: 0.84, laborRate: 102, volume: 15 },
  { name: "Orange Park Truck Repair", city: "Orange Park", region: "FL", lat: 30.1661, lng: -81.7065, factor: 1.0, laborRate: 131, volume: 7 },
  // Sarasota / south
  { name: "Sarasota Fleet & Diesel", city: "Sarasota", region: "FL", lat: 27.3364, lng: -82.5307, factor: 1.06, laborRate: 140, volume: 12 },
  { name: "Bradenton Truck Works", city: "Bradenton", region: "FL", lat: 27.4989, lng: -82.5748, factor: 0.91, laborRate: 116, volume: 10 },
  { name: "Fort Myers Commercial Service", city: "Fort Myers", region: "FL", lat: 26.6406, lng: -81.8723, factor: 1.14, laborRate: 149, volume: 9 },
  // Ocala / Gainesville
  { name: "Ocala Truck & Trailer", city: "Ocala", region: "FL", lat: 29.1872, lng: -82.1401, factor: 0.89, laborRate: 108, volume: 11 },
  { name: "Gainesville Fleet Service", city: "Gainesville", region: "FL", lat: 29.6516, lng: -82.3248, factor: 1.02, laborRate: 133, volume: 6 },
];

const STREETS = ["Industrial Blvd", "Commerce Way", "Truck Center Dr", "Hwy 92", "Airport Rd", "Frontage Rd", "Causeway Blvd", "Enterprise Pkwy"];

function pickWeighted(rand: () => number): TaskDef {
  const total = TASKS.reduce((s, t) => s + t.weight, 0);
  let r = rand() * total;
  for (const t of TASKS) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return TASKS[0];
}

function emptyStat(): TaskStat {
  return { count: 0, total: 0, min: Infinity, max: -Infinity, labor: 0, parts: 0 };
}

export function buildMockDataset(lookbackMonths = 12): ShopDataset {
  const rand = rng(20261015);
  const now = new Date("2026-10-15T12:00:00Z").getTime();
  const span = lookbackMonths * 30.4 * 86400000;
  const fleet = Array.from({ length: 180 }, (_, i) => `WP-${1000 + i}`);
  let invoiceId = 410000;

  const shops: Shop[] = SHOPS.map((seed, idx) => {
    const visits = Math.max(2, Math.round(seed.volume * (lookbackMonths / 12) * (0.8 + rand() * 0.4)));
    const tasks: Record<string, TaskStat> = {};
    const invoices: InvoiceSummary[] = [];
    const vehicleSet = new Set<string>();
    let spend = 0,
      laborSpend = 0,
      partsSpend = 0,
      laborHours = 0,
      laborSpendTimed = 0;
    let first = Infinity,
      last = -Infinity;

    for (let v = 0; v < visits; v++) {
      const when = now - rand() * span;
      first = Math.min(first, when);
      last = Math.max(last, when);
      const vehicle = fleet[Math.floor(rand() * fleet.length)];
      vehicleSet.add(vehicle);
      const nTasks = 1 + (rand() < 0.35 ? 1 : 0) + (rand() < 0.12 ? 1 : 0);
      const picked = new Set<TaskDef>();
      while (picked.size < nTasks) picked.add(pickWeighted(rand));

      let invLabor = 0,
        invParts = 0,
        invHours = 0;
      const names: string[] = [];
      for (const t of picked) {
        const noise = 0.85 + rand() * 0.3;
        const cost = t.base * seed.factor * noise;
        const labor = cost * t.laborShare;
        const parts = cost - labor;
        const stat = (tasks[t.name] ??= emptyStat());
        stat.count++;
        stat.total += cost;
        stat.labor += labor;
        stat.parts += parts;
        stat.min = Math.min(stat.min, cost);
        stat.max = Math.max(stat.max, cost);
        invLabor += labor;
        invParts += parts;
        invHours += labor / seed.laborRate; // consistent with the shop's rate
        names.push(t.name);
      }
      const total = invLabor + invParts;
      spend += total;
      laborSpend += invLabor;
      partsSpend += invParts;
      // ~70% of entries have labor time recorded (mirrors real Fleetio usage).
      if (rand() < 0.7) {
        laborHours += invHours;
        laborSpendTimed += invLabor;
      }
      invoices.push({
        id: invoiceId++,
        date: new Date(when).toISOString(),
        vehicle,
        total: Math.round(total * 100) / 100,
        labor: Math.round(invLabor * 100) / 100,
        parts: Math.round(invParts * 100) / 100,
        tasks: names,
        reference: `RO-${Math.floor(10000 + rand() * 89999)}`,
        url: null,
      });
    }
    invoices.sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const s of Object.values(tasks)) {
      s.total = Math.round(s.total * 100) / 100;
      s.labor = Math.round(s.labor * 100) / 100;
      s.parts = Math.round(s.parts * 100) / 100;
      s.min = Math.round(s.min * 100) / 100;
      s.max = Math.round(s.max * 100) / 100;
    }
    return {
      id: 5000 + idx,
      name: seed.name,
      address: `${100 + Math.floor(rand() * 9800)} ${STREETS[idx % STREETS.length]}`,
      city: seed.city,
      region: seed.region,
      lat: seed.lat,
      lng: seed.lng,
      labels: seed.labels ?? [],
      phone: null,
      website: null,
      service: true,
      parts: rand() < 0.4,
      fuel: false,
      visits,
      vehicles: vehicleSet.size,
      spend: Math.round(spend * 100) / 100,
      laborSpend: Math.round(laborSpend * 100) / 100,
      partsSpend: Math.round(partsSpend * 100) / 100,
      laborHours: Math.round(laborHours * 100) / 100,
      laborSpendTimed: Math.round(laborSpendTimed * 100) / 100,
      firstVisit: new Date(first).toISOString(),
      lastVisit: new Date(last).toISOString(),
      tasks,
      invoices: invoices.slice(0, 25),
    };
  });

  const taskTotals = new Map<string, number>();
  for (const s of shops) for (const [n, st] of Object.entries(s.tasks)) taskTotals.set(n, (taskTotals.get(n) ?? 0) + st.count);

  return {
    source: "mock",
    generatedAt: new Date(now).toISOString(),
    lookbackMonths,
    currency: "USD",
    account: "Demo fleet (synthetic)",
    shops,
    unmappedShops: [
      { id: 5900, name: "Mobile Mechanic – J. Alvarez", visits: 6, spend: 2140.5 },
      { id: 5901, name: "Dealer Warranty (no address)", visits: 3, spend: 0 },
    ],
    tasks: [...taskTotals.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n),
  };
}
