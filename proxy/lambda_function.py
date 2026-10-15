"""
GPSFMS Shop Prices — Fleetio proxy for the MyGeotab Map Add-In.

Why a proxy?  The add-in runs in a sandboxed iframe inside MyGeotab. Fleetio's
API neither allows browser (CORS) calls nor should its API key ever ship to a
browser. So the add-in POSTs its MyGeotab session here; this function:

  1. verifies that session against the user's own MyGeotab server
     (a cheap `Get User` JSON-RPC call — invalid/expired sessions get a 401);
  2. maps the MyGeotab *database* name to a Fleetio account (API key +
     Account-Token) from FLEETIO_ACCOUNTS (env JSON) or a Secrets Manager secret;
  3. pulls Vendors (/api/v1/vendors) and Service Entries (/api/v2/service_entries)
     for the look-back window and rolls them up per shop (visits, spend,
     labor hours, cost by service task, recent invoices);
  4. returns the `ShopDataset` JSON the add-in renders (see src/types.ts).

Deploy as a Lambda Function URL (auth NONE, CORS: allow origin *, methods POST,
headers content-type) — Python 3.12, no third-party packages (urllib only;
boto3 is present in the runtime for Secrets Manager).

Environment variables
  FLEETIO_ACCOUNTS            JSON: {"<geotab database>": {"api_key": "...",
                              "account_token": "...", "label": "Waste Pro",
                              "fleetio_base_url": "https://secure.fleetio.com"}}
  FLEETIO_ACCOUNTS_SECRET_ARN (alternative) Secrets Manager secret holding that JSON
  ALLOWED_GEOTAB_DOMAIN_SUFFIX default ".geotab.com" — session checks only go here
  CACHE_TTL_SECONDS           default 900
  MAX_LOOKBACK_MONTHS         default 36
  FLEETIO_API_VERSION         default "2025-05-05"
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

FLEETIO_API = "https://secure.fleetio.com/api"
API_VERSION = os.environ.get("FLEETIO_API_VERSION", "2025-05-05")
CACHE_TTL = int(os.environ.get("CACHE_TTL_SECONDS", "900"))
MAX_LOOKBACK = int(os.environ.get("MAX_LOOKBACK_MONTHS", "36"))
DOMAIN_SUFFIX = os.environ.get("ALLOWED_GEOTAB_DOMAIN_SUFFIX", ".geotab.com")
USER_AGENT = "gpsfms-shop-prices-proxy/1.0"
TASK_LINE_TYPE = "ServiceEntryServiceTaskLineItem"
RECENT_INVOICES = 25

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Content-Type": "application/json",
}

_cache: Dict[str, Any] = {}
_accounts_cache: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------


class HttpError(Exception):
    def __init__(self, status: int, body: str):
        super().__init__(f"HTTP {status}: {body[:300]}")
        self.status = status
        self.body = body


def _request(method: str, url: str, headers: Dict[str, str], body: Optional[bytes] = None, timeout: int = 30) -> Any:
    req = urllib.request.Request(url, data=body, method=method, headers={"User-Agent": USER_AGENT, **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (host is validated by callers)
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise HttpError(e.code, e.read().decode("utf-8", "replace")) from None


def _response(status: int, payload: Any) -> Dict[str, Any]:
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps(payload, default=str)}


# ---------------------------------------------------------------------------
# MyGeotab session validation
# ---------------------------------------------------------------------------


def validate_geotab_session(database: str, user_name: str, session_id: str, domain: str) -> None:
    """Raise PermissionError unless the session is good on the user's own server."""
    if not all([database, user_name, session_id, domain]):
        raise PermissionError("database, userName, sessionId and domain are required")
    host = domain.strip().lower()
    if not re.fullmatch(r"[a-z0-9.-]+", host) or not host.endswith(DOMAIN_SUFFIX):
        raise PermissionError("domain is not a MyGeotab server")
    payload = {
        "method": "Get",
        "params": {
            "typeName": "User",
            "search": {"name": user_name},
            "credentials": {"database": database, "userName": user_name, "sessionId": session_id},
            "resultsLimit": 1,
        },
    }
    try:
        result = _request(
            "POST", f"https://{host}/apiv1", {"Content-Type": "application/json"}, json.dumps(payload).encode(), timeout=20
        )
    except HttpError as e:
        raise PermissionError(f"MyGeotab rejected the session ({e.status})") from None
    if not isinstance(result, dict) or "error" in result or not result.get("result"):
        msg = (result or {}).get("error", {}).get("message", "session invalid") if isinstance(result, dict) else "session invalid"
        raise PermissionError(f"MyGeotab session check failed: {msg}")


# ---------------------------------------------------------------------------
# Fleetio
# ---------------------------------------------------------------------------


def load_accounts() -> Dict[str, Any]:
    global _accounts_cache
    if _accounts_cache is not None:
        return _accounts_cache
    raw = os.environ.get("FLEETIO_ACCOUNTS")
    arn = os.environ.get("FLEETIO_ACCOUNTS_SECRET_ARN")
    if not raw and arn:
        import boto3  # type: ignore  # available in the Lambda runtime

        raw = boto3.client("secretsmanager").get_secret_value(SecretId=arn)["SecretString"]
    if not raw:
        raise RuntimeError("FLEETIO_ACCOUNTS (or FLEETIO_ACCOUNTS_SECRET_ARN) is not configured")
    accounts = json.loads(raw)
    _accounts_cache = {k.lower(): v for k, v in accounts.items()}
    return _accounts_cache


class Fleetio:
    def __init__(self, api_key: str, account_token: str):
        self.headers = {
            "Authorization": f"Token {api_key}",
            "Account-Token": account_token,
            "Accept": "application/json",
            "X-Api-Version": API_VERSION,
        }

    def _get(self, path: str, params: Dict[str, str]) -> Any:
        url = f"{FLEETIO_API}{path}?{urllib.parse.urlencode(params)}"
        for attempt in range(4):
            try:
                return _request("GET", url, self.headers)
            except HttpError as e:
                if e.status == 429 and attempt < 3:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                raise

    def paged(self, path: str, params: Dict[str, str]) -> Iterable[Dict[str, Any]]:
        """Keyset pagination (start_cursor / next_cursor) used by current Fleetio endpoints."""
        cursor: Optional[str] = None
        while True:
            q = dict(params, per_page="100")
            if cursor:
                q["start_cursor"] = cursor
            page = self._get(path, q)
            records = page.get("records", []) if isinstance(page, dict) else (page or [])
            for r in records:
                yield r
            cursor = page.get("next_cursor") if isinstance(page, dict) else None
            if not cursor or not records:
                break

    def vendors(self) -> List[Dict[str, Any]]:
        return list(self.paged("/v1/vendors", {}))

    def service_entries(self, since: datetime) -> List[Dict[str, Any]]:
        since_iso = since.strftime("%Y-%m-%dT%H:%M:%SZ")
        try:
            return list(
                self.paged(
                    "/v2/service_entries",
                    {"filter[completed_at][gte]": since_iso, "sort[completed_at]": "desc"},
                )
            )
        except HttpError as e:
            if e.status != 400:
                raise
        # Older API behaviour / unsupported filter: walk newest-first and stop at the window edge.
        out: List[Dict[str, Any]] = []
        for rec in self.paged("/v2/service_entries", {"sort[completed_at]": "desc"}):
            done = rec.get("completed_at") or rec.get("date")
            if done and done < since_iso:
                break
            out.append(rec)
        return out


# ---------------------------------------------------------------------------
# Aggregation → ShopDataset
# ---------------------------------------------------------------------------


def _f(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _line_cost(li: Dict[str, Any]) -> float:
    labor, parts = _f(li.get("labor_cost")), _f(li.get("parts_cost"))
    return labor + parts if (labor or parts) else _f(li.get("subtotal"))


def build_dataset(
    vendors: List[Dict[str, Any]],
    entries: List[Dict[str, Any]],
    lookback_months: int,
    label: Optional[str] = None,
    fleetio_base_url: str = "https://secure.fleetio.com",
) -> Dict[str, Any]:
    by_vendor: Dict[int, Dict[str, Any]] = {}
    vehicles: Dict[int, set] = defaultdict(set)
    task_counts: Dict[str, int] = defaultdict(int)

    for e in entries:
        vid = e.get("vendor_id")
        if vid is None:
            continue
        if (e.get("status") or "completed") != "completed":
            continue
        agg = by_vendor.setdefault(
            vid,
            {
                "visits": 0,
                "spend": 0.0,
                "laborSpend": 0.0,
                "partsSpend": 0.0,
                "laborHours": 0.0,
                "laborSpendTimed": 0.0,
                "first": None,
                "last": None,
                "tasks": {},
                "invoices": [],
            },
        )
        inv = e.get("invoice") or {}
        items = e.get("service_entry_line_items") or []
        total = _f(inv.get("total_amount")) or _f(e.get("total_amount")) or sum(_line_cost(li) for li in items)
        labor = _f(inv.get("labor_subtotal")) or _f(e.get("labor_subtotal")) or sum(_f(li.get("labor_cost")) for li in items)
        parts = _f(inv.get("parts_subtotal")) or _f(e.get("parts_subtotal")) or sum(_f(li.get("parts_cost")) for li in items)
        secs = _f(e.get("labor_time_in_seconds"))
        when = e.get("completed_at") or e.get("date") or ""

        agg["visits"] += 1
        agg["spend"] += total
        agg["laborSpend"] += labor
        agg["partsSpend"] += parts
        if secs > 0 and labor > 0:
            agg["laborHours"] += secs / 3600.0
            agg["laborSpendTimed"] += labor
        if when:
            agg["first"] = when if agg["first"] is None or when < agg["first"] else agg["first"]
            agg["last"] = when if agg["last"] is None or when > agg["last"] else agg["last"]
        vehicle = e.get("vehicle_name") or str(e.get("vehicle_id") or "")
        if vehicle:
            vehicles[vid].add(vehicle)

        names: List[str] = []
        for li in items:
            if li.get("type") not in (None, TASK_LINE_TYPE):
                continue
            task = (li.get("service_task") or {}).get("name") or li.get("description")
            if not task:
                continue
            cost = _line_cost(li)
            st = agg["tasks"].setdefault(task, {"count": 0, "total": 0.0, "min": None, "max": None, "labor": 0.0, "parts": 0.0})
            st["count"] += 1
            st["total"] += cost
            st["labor"] += _f(li.get("labor_cost"))
            st["parts"] += _f(li.get("parts_cost"))
            st["min"] = cost if st["min"] is None else min(st["min"], cost)
            st["max"] = cost if st["max"] is None else max(st["max"], cost)
            task_counts[task] += 1
            names.append(task)
        if not names:
            names = [t.get("name") for t in (e.get("service_tasks") or []) if t.get("name")]

        agg["invoices"].append(
            {
                "id": e.get("id"),
                "date": when,
                "vehicle": vehicle,
                "total": round(total, 2),
                "labor": round(labor, 2),
                "parts": round(parts, 2),
                "tasks": names,
                "reference": e.get("reference"),
                "url": f"{fleetio_base_url.rstrip('/')}/service_entries/{e.get('id')}" if e.get("id") else None,
            }
        )

    shops: List[Dict[str, Any]] = []
    unmapped: List[Dict[str, Any]] = []
    vendor_by_id = {v.get("id"): v for v in vendors}
    for vid, agg in by_vendor.items():
        v = vendor_by_id.get(vid, {"id": vid, "name": f"Vendor {vid}"})
        lat, lng = v.get("latitude"), v.get("longitude")
        invoices = sorted(agg["invoices"], key=lambda i: i["date"] or "", reverse=True)[:RECENT_INVOICES]
        if lat is None or lng is None:
            unmapped.append({"id": vid, "name": v.get("name"), "visits": agg["visits"], "spend": round(agg["spend"], 2)})
            continue
        shops.append(
            {
                "id": vid,
                "name": v.get("name") or f"Vendor {vid}",
                "address": " ".join(filter(None, [v.get("street_address"), v.get("street_address_line_2")])),
                "city": v.get("city") or "",
                "region": v.get("region") or "",
                "lat": float(lat),
                "lng": float(lng),
                "labels": [l.get("name") for l in (v.get("labels") or []) if l.get("name")],
                "phone": v.get("phone"),
                "website": v.get("website"),
                "service": bool(v.get("service", True)),
                "parts": bool(v.get("parts", False)),
                "fuel": bool(v.get("fuel", False)),
                "visits": agg["visits"],
                "vehicles": len(vehicles[vid]),
                "spend": round(agg["spend"], 2),
                "laborSpend": round(agg["laborSpend"], 2),
                "partsSpend": round(agg["partsSpend"], 2),
                "laborHours": round(agg["laborHours"], 2),
                "laborSpendTimed": round(agg["laborSpendTimed"], 2),
                "firstVisit": agg["first"],
                "lastVisit": agg["last"],
                "tasks": {
                    t: {**s, "total": round(s["total"], 2), "labor": round(s["labor"], 2), "parts": round(s["parts"], 2)}
                    for t, s in agg["tasks"].items()
                },
                "invoices": invoices,
            }
        )

    shops.sort(key=lambda s: s["spend"], reverse=True)
    return {
        "source": "fleetio",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "lookbackMonths": lookback_months,
        "currency": "USD",
        "account": label,
        "shops": shops,
        "unmappedShops": sorted(unmapped, key=lambda u: u["spend"], reverse=True),
        "tasks": [t for t, _ in sorted(task_counts.items(), key=lambda kv: kv[1], reverse=True)],
    }


# ---------------------------------------------------------------------------
# Lambda entry point (Function URL / API Gateway HTTP API, payload v2)
# ---------------------------------------------------------------------------


def lambda_handler(event: Dict[str, Any], context: Any = None) -> Dict[str, Any]:
    method = (event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod") or "POST").upper()
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": CORS_HEADERS, "body": ""}
    if method != "POST":
        return _response(405, {"error": "POST a MyGeotab session: {database, userName, sessionId, domain, lookbackMonths}"})

    try:
        body = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            import base64

            body = base64.b64decode(body).decode("utf-8")
        req = json.loads(body)
    except (ValueError, TypeError):
        return _response(400, {"error": "Body must be JSON"})

    database = str(req.get("database") or "").strip()
    user_name = str(req.get("userName") or "").strip()
    session_id = str(req.get("sessionId") or "").strip()
    domain = str(req.get("domain") or "").strip()
    try:
        lookback = max(1, min(MAX_LOOKBACK, int(req.get("lookbackMonths") or 12)))
    except (TypeError, ValueError):
        lookback = 12

    try:
        validate_geotab_session(database, user_name, session_id, domain)
    except PermissionError as e:
        return _response(401, {"error": str(e)})

    try:
        accounts = load_accounts()
    except Exception as e:  # noqa: BLE001
        return _response(500, {"error": f"Proxy misconfigured: {e}"})
    account = accounts.get(database.lower())
    if not account:
        return _response(404, {"error": f"No Fleetio account is mapped to MyGeotab database '{database}'"})

    cache_key = f"{database.lower()}|{lookback}"
    hit = _cache.get(cache_key)
    if hit and time.time() - hit["at"] < CACHE_TTL:
        return _response(200, hit["data"])

    since = datetime.now(timezone.utc) - timedelta(days=int(lookback * 30.4375))
    try:
        fl = Fleetio(account["api_key"], account["account_token"])
        vendors = fl.vendors()
        entries = fl.service_entries(since)
    except HttpError as e:
        return _response(502, {"error": f"Fleetio request failed: {e}"})
    except Exception as e:  # noqa: BLE001
        return _response(502, {"error": f"Fleetio request failed: {e}"})

    data = build_dataset(
        vendors,
        entries,
        lookback,
        label=account.get("label") or database,
        fleetio_base_url=account.get("fleetio_base_url", "https://secure.fleetio.com"),
    )
    _cache[cache_key] = {"at": time.time(), "data": data}
    return _response(200, data)
