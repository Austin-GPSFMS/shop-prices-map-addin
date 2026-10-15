"""Offline unit test for the aggregation (no network). Run: python3 -I proxy/test_build_dataset.py"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lambda_function import build_dataset, lambda_handler  # noqa: E402

VENDORS = [
    {"id": 1, "name": "Bay Area Truck Service", "street_address": "100 Industrial Blvd", "city": "Tampa", "region": "FL",
     "latitude": 27.98, "longitude": -82.40, "labels": [{"id": 9, "name": "Preferred"}], "service": True, "parts": False, "fuel": False},
    {"id": 2, "name": "Mobile Mechanic", "city": "Tampa", "region": "FL", "latitude": None, "longitude": None, "labels": []},
    {"id": 3, "name": "Unused Vendor", "latitude": 1, "longitude": 1},
]

ENTRIES = [
    {   # shaped like a v2 service entry (amounts under `invoice`)
        "id": 100, "status": "completed", "completed_at": "2026-09-10T14:00:00Z", "vendor_id": 1,
        "vehicle_id": 7, "vehicle_name": "WP-1042", "reference": "RO-1", "labor_time_in_seconds": 7200,
        "invoice": {"total_amount": 500.0, "labor_subtotal": 240.0, "parts_subtotal": 260.0},
        "service_entry_line_items": [
            {"type": "ServiceEntryServiceTaskLineItem", "labor_cost": 120.0, "parts_cost": 60.0, "subtotal": 180.0,
             "service_task": {"id": 1, "name": "Engine Oil & Filter Change"}},
            {"type": "ServiceEntryServiceTaskLineItem", "labor_cost": 120.0, "parts_cost": 200.0, "subtotal": 320.0,
             "service_task": {"id": 2, "name": "Brake Pads & Rotors – Front"}},
            {"type": "ServiceEntryFeeLineItem", "subtotal": 10.0, "description": "Shop supplies"},
        ],
    },
    {   # second visit, same vendor, no labor time, subtotal-only line item
        "id": 101, "status": "completed", "completed_at": "2026-08-01T14:00:00Z", "vendor_id": 1,
        "vehicle_id": 8, "vehicle_name": "WP-1107", "labor_time_in_seconds": None,
        "invoice": {"total_amount": 200.0, "labor_subtotal": 90.0, "parts_subtotal": 110.0},
        "service_entry_line_items": [
            {"type": "ServiceEntryServiceTaskLineItem", "labor_cost": 0, "parts_cost": 0, "subtotal": 200.0,
             "service_task": {"id": 1, "name": "Engine Oil & Filter Change"}},
        ],
    },
    {   # unmapped vendor
        "id": 102, "status": "completed", "completed_at": "2026-07-01T14:00:00Z", "vendor_id": 2,
        "vehicle_id": 8, "vehicle_name": "WP-1107",
        "invoice": {"total_amount": 150.0, "labor_subtotal": 150.0, "parts_subtotal": 0},
        "service_entry_line_items": [{"type": "ServiceEntryServiceTaskLineItem", "subtotal": 150.0,
                                      "service_task": {"id": 3, "name": "Tire Rotation"}}],
    },
    {"id": 103, "status": "pending", "completed_at": None, "vendor_id": 1, "invoice": {"total_amount": 999}},
    {"id": 104, "status": "completed", "completed_at": "2026-07-01T14:00:00Z", "vendor_id": None},
]


def main() -> None:
    ds = build_dataset(VENDORS, ENTRIES, 12, label="Test")
    assert ds["source"] == "fleetio"
    assert [s["name"] for s in ds["shops"]] == ["Bay Area Truck Service"], ds["shops"]
    s = ds["shops"][0]
    assert s["visits"] == 2 and s["vehicles"] == 2
    assert s["spend"] == 700.0 and s["laborSpend"] == 330.0 and s["partsSpend"] == 370.0
    assert s["laborHours"] == 2.0 and s["laborSpendTimed"] == 240.0  # only the timed invoice counts
    assert s["labels"] == ["Preferred"] and s["address"] == "100 Industrial Blvd"
    assert s["firstVisit"] == "2026-08-01T14:00:00Z" and s["lastVisit"] == "2026-09-10T14:00:00Z"
    oil = s["tasks"]["Engine Oil & Filter Change"]
    assert oil["count"] == 2 and oil["total"] == 380.0 and oil["min"] == 180.0 and oil["max"] == 200.0, oil
    assert "Shop supplies" not in s["tasks"]  # fee lines are not services
    assert s["invoices"][0]["id"] == 100 and s["invoices"][0]["tasks"] == ["Engine Oil & Filter Change", "Brake Pads & Rotors – Front"]
    assert s["invoices"][0]["url"].endswith("/service_entries/100")
    assert ds["unmappedShops"] == [{"id": 2, "name": "Mobile Mechanic", "visits": 1, "spend": 150.0}]
    assert ds["tasks"][0] == "Engine Oil & Filter Change"
    json.dumps(ds)  # serialisable

    # Handler plumbing: CORS preflight and input validation (no network).
    assert lambda_handler({"requestContext": {"http": {"method": "OPTIONS"}}})["statusCode"] == 204
    r = lambda_handler({"requestContext": {"http": {"method": "POST"}}, "body": "{}"})
    assert r["statusCode"] == 401 and "required" in json.loads(r["body"])["error"]
    r = lambda_handler({"requestContext": {"http": {"method": "POST"}},
                        "body": json.dumps({"database": "x", "userName": "u", "sessionId": "s", "domain": "evil.example.com"})})
    assert r["statusCode"] == 401 and "not a MyGeotab server" in json.loads(r["body"])["error"]
    print("build_dataset + handler checks OK")


if __name__ == "__main__":
    main()
