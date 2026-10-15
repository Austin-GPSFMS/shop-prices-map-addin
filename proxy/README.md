# Fleetio proxy (AWS Lambda)

The Map Add-In can't call Fleetio directly (no CORS, and the API key must
not reach the browser), so `lambda_function.py` sits in between:

```
MyGeotab map iframe ──POST {database,userName,sessionId,domain,lookbackMonths}──▶ Lambda
                                                                                   │ 1. Get User on https://{domain}/apiv1 with those credentials (401 if invalid)
                                                                                   │ 2. database → Fleetio account (FLEETIO_ACCOUNTS)
                                                                                   │ 3. GET /api/v1/vendors, GET /api/v2/service_entries (completed_at ≥ window)
                                                                                   │ 4. roll up per vendor → ShopDataset JSON (cached 15 min)
                      ◀──────────────────── ShopDataset ───────────────────────────┘
```

## Deploy

1. Lambda, Python 3.12, handler `lambda_function.lambda_handler`, timeout 60 s, memory 512 MB.
   Upload `lambda_function.py` (no dependencies).
2. Environment:
   ```
   FLEETIO_ACCOUNTS = {"wastepro": {"api_key": "…", "account_token": "…", "label": "Waste Pro"},
                       "demo_db":  {"api_key": "…", "account_token": "…", "label": "Demo"}}
   ```
   Keys are MyGeotab **database** names (case-insensitive). For production put the
   same JSON in Secrets Manager and set `FLEETIO_ACCOUNTS_SECRET_ARN` instead
   (the Lambda role needs `secretsmanager:GetSecretValue`).
3. Function URL: auth type **NONE**, CORS enabled — allow origin `*`
   (the add-in iframe has an opaque origin), methods `POST`, headers `content-type`.
   Security comes from step 1 above, not from the URL being secret: every request
   must carry a live MyGeotab session, and only databases listed in
   `FLEETIO_ACCOUNTS` get anything back.
4. Paste the Function URL into the add-in: **Settings → Fleetio proxy URL → Save**.

Fleetio API keys come from Fleetio → Account → API Keys; the Account-Token is
shown next to the key. The key only needs read access to Vendors and Service
Entries.

## Local check

```
python3 -I proxy/test_build_dataset.py
```

exercises the aggregation and handler validation without network access.
To try the real Fleetio pull from a shell:

```python
from lambda_function import Fleetio, build_dataset
from datetime import datetime, timedelta, timezone
fl = Fleetio("API_KEY", "ACCOUNT_TOKEN")
ds = build_dataset(fl.vendors(), fl.service_entries(datetime.now(timezone.utc) - timedelta(days=365)), 12, "Test")
print(len(ds["shops"]), "shops;", ds["unmappedShops"])
```

## What the add-in gets

See `ShopDataset` in `src/types.ts`. Per vendor: visits, distinct vehicles,
spend / labor / parts, labor hours (only from service entries that recorded
`labor_time_in_seconds`, so the $/hr rate is honest), cost by service task
(from `ServiceEntryServiceTaskLineItem` lines: `labor_cost + parts_cost`, or
`subtotal` when both are zero), and the 25 most recent invoices with deep links.
Vendors with invoices but no latitude/longitude in Fleetio are returned under
`unmappedShops` so the panel can say who's missing from the map.
