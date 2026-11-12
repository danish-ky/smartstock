# SmartStock Architecture & Interview Notes

## Overview

- **Web UI:** React + TypeScript. A protected shell controls navigation; each page loads live API resources. Vite env var `VITE_API_URL` points at the API.
- **API:** Django REST Framework. Custom `accounts.User` supplies roles. ViewSets encapsulate endpoints and permissions, serializers enforce validation.
- **Service layer:** `inventory/services.py` owns stock and order mutations, separated from HTTP handling so it can be reused by a mobile client.
- **Database:** SQLite locally, PostgreSQL production. Business keys include unique SKU and order number; normalized order lines preserve product-price snapshots.

## Most important business workflow

1. Manager creates a product with a unique SKU and prices; initial stock is zero.
2. Staff records stock-in; the service locks the product, updates `stock`, and creates an audit movement.
3. Staff places an order with customer and item quantities.
4. The service locks products in sorted ID order, checks availability, creates order/items, deducts stock and records sale movements within one atomic transaction.
5. If a manager cancels a placed order, stock is restored exactly once, with return movements; fulfilled orders cannot be cancelled through this endpoint.
6. Dashboard and reports query noncancelled sales; product stock states are based on thresholds.

## Why atomic transactions and row locks?

Without an atomic transaction, an order could be inserted even if stock deduction fails. Without locking, concurrent transactions could oversell the same product. `transaction.atomic()` ensures all-or-nothing writes, and `select_for_update()` locks rows under PostgreSQL. SQLite is a convenient local option but does not provide the same row-level locking characteristics; use PostgreSQL for real concurrent usage.

## Data design

- `Order` / `OrderItem` is a one-to-many relation. Prices are copied into `OrderItem.unit_price` at order time, so product price edits never change past totals.
- `StockMovement` records every stock adjustment, sale and cancellation. This provides traceability.
- `Product.stock` is a materialized quantity cache for fast availability checks; direct editing through product CRUD is prohibited.
- Soft-archiving a product avoids losing sales history. Archived products are not offered for new orders.

## Security boundaries

- JWT access tokens are short-lived (30 minutes) and refresh tokens rotate with blacklisting.
- Sensitive actions use server-side role checks. UI hiding alone does not confer security.
- All Django API endpoints use authentication by default except login, refresh, Swagger/schema as configured, and health.
- Admins manage users; managers manage business entities; staff transact orders/stock/customers; users read the public internal catalog.
- Frontend uses session storage for assessment simplicity. Harden later with secure HttpOnly cookie flows and CSRF protection.

## Frontend design

- Dark ink sidebar and white, spacious content panels for a professional admin experience.
- Reusable modal, field, status and table components reduce duplication.
- Mobile responsive layout with slide-out sidebar and scrolling tabular data.
- Recharts displays real API data; CSV exports are generated client-side.

## Current limitations

- No Android build in this package.
- No payments, returns after fulfillment, multi-warehouse routing, barcode scan or product photo upload; these are outside the assessment's minimum web scope.
- `api.list()` loads up to 50 paginated server pages for client filtering; a large deployment should use server-side search/pagination and virtualized tables.
- Real-time notifications use dashboard alerts after refresh, not WebSockets/push notifications.
- Runtime installation, migrations, browser and API tests must be executed on a system with dependencies available.
