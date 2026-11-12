# SmartStock — Inventory & Order Management

A professional **React + TypeScript + Tailwind CSS** web dashboard with a **Django REST Framework API**, JWT login, custom roles, catalog management, inventory audit trail, customers, suppliers, sales orders, and analytics.

> **Codebxo assessment scope:** This package implements the **web application + API + database schema**. An Android app, production deployment, and demo screen recording are separate submission deliverables and are **not** included in this ZIP. The project has been statically checked but dependency installation / API runtime tests could not be executed in the generation environment (no package registry network access). Run the commands below locally and fix any reported environment-specific issues before submitting.

## Stack

- Frontend: Vite, React 18, TypeScript, Tailwind CSS 3, custom dashboard CSS, Recharts, Lucide icons
- Backend: Django 5.2, Django REST Framework, SimpleJWT with refresh-token blacklist, drf-spectacular (Swagger)
- Database: **SQLite for simple local development**, PostgreSQL via `DATABASE_URL` for production
- Auth: JWT authentication, Admin / Manager / Staff / User permissions
- API: `http://127.0.0.1:8000/api/` by default
- Web: `http://localhost:5173/` by default

## 1. Run the backend (Windows PowerShell)

Open a terminal in the `backend` folder:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env`: add a random secret `DJANGO_SECRET_KEY`, retain `DJANGO_DEBUG=True` for local development. **Leave `DATABASE_URL=` empty** to use SQLite instead of installing PostgreSQL immediately.

```powershell
python manage.py migrate
python manage.py createsuperuser
python manage.py check
python manage.py test
python manage.py runserver
```

**Note:** `createsuperuser` asks for username, email and password. Your superuser automatically has the `admin` role. Use its username and password to sign into the web application.

To add realistic sample data (optional), set `DEMO_ADMIN_PASSWORD=<a-strong-unique-password>` in `backend/.env` and run:

```powershell
python manage.py seed_demo
```

Then sign in as `demo_admin` using the **password that you set**. The command creates the demo admin only if that username does not already exist; it does not reset an existing user's password. Sample data is for development only.

On macOS/Linux, use `python3 -m venv .venv`, `source .venv/bin/activate`, `cp .env.example .env`, and `python3` as appropriate.

> Existing DB warning: This is a **standalone codebase with its own initial migrations**. Do not copy these migrations directly over your earlier SmartStock database without reconciling models and migration history. Use a fresh database to test this package first.

## 2. Run the frontend

Open a **second** terminal in `frontend`:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open **http://localhost:5173/** and log in. The frontend `.env` contains:

```env
VITE_API_URL=http://127.0.0.1:8000/api
VITE_CURRENCY=INR
```

Modify `VITE_CURRENCY` if your store uses a different ISO currency code. Store prices in that currency; no conversion takes place.

### Production builds

```powershell
cd frontend
npm run typecheck
npm run build
```

Vite builds static assets into `frontend/dist/`. Set `VITE_API_URL` to your deployed API address **before** the production build.

## 3. Modules and functional workflows

| Module | Features |
|---|---|
| Login | Username/password login, JWT auto-refresh, refresh blacklist on logout, authenticated account info |
| Dashboard | Active products, stock quantities, order totals, sales value, low-stock alerts, sales chart, recent orders |
| Products | Create/edit/archive products, SKU validation, category/supplier assignment, search, filters, CSV export |
| Categories | Add/edit/delete categories (protected if referenced) |
| Inventory | Stock-in, stock-out, insufficient-stock rejection, full audit log, stock alerts, movement CSV export |
| Customers | Add/edit/delete customer records, contact information, search, CSV |
| Suppliers | Add/edit/delete suppliers, contact information, CSV |
| Orders | Customer order with multiple products, duplicate-line validation, atomic stock deduction, unit-price snapshots, fulfillment, cancel/restock, CSV |
| Reports | Sales summary, average sale, valuation at cost, top products, category stock, date range, bar/donut charts, CSV |
| Team | Admin-only creation/edit/deactivation/deletion of users, role assignment, password validation |

**Critical stock invariant:** `Product.stock` cannot be changed from product CRUD. Only `POST /api/inventory/adjust/` and the order service change quantities, inside database transactions, while creating `StockMovement` audit records. Deleting a product archives it; it must have zero remaining stock. Orders with status `placed` or `fulfilled` count toward total sales; `cancelled` orders do not.

## 4. Role permissions

| Feature | Admin | Manager | Staff | User |
|---|:---:|:---:|:---:|:---:|
| View product catalog | ✓ | ✓ | ✓ | ✓ |
| Edit products/categories/suppliers | ✓ | ✓ | — | — |
| View operational dashboard | ✓ | ✓ | ✓ | — |
| Manage customers | ✓ | ✓ | ✓ | — |
| Stock-in/out | ✓ | ✓ | ✓ | — |
| Create/fulfill orders | ✓ | ✓ | ✓ | — |
| Cancel orders | ✓ | ✓ | — | — |
| Sales/inventory reports | ✓ | ✓ | — | — |
| Manage staff accounts | ✓ | — | — | — |

All authorization is enforced **in the API**, not only by hiding web navigation links. Users with the ordinary `user` role have product/category read access only.

## 5. API endpoints

**Swagger UI:** `http://127.0.0.1:8000/api/docs/`  
**OpenAPI JSON:** `http://127.0.0.1:8000/api/schema/`

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login/` | Obtain access + refresh tokens with username/password |
| POST | `/api/auth/refresh/` | Rotate access/refresh tokens |
| POST | `/api/auth/logout/` | Blacklist supplied refresh token |
| GET | `/api/auth/me/` | Current user and role |
| GET | `/api/dashboard/` | Dashboard metrics |
| GET/POST | `/api/products/` | List/create products |
| GET/PATCH/DELETE | `/api/products/{id}/` | View/edit/archive product |
| GET/POST | `/api/categories/` | List/create categories |
| GET/PATCH/DELETE | `/api/categories/{id}/` | Category detail/edit/delete |
| GET/POST | `/api/suppliers/` | Supplier CRUD collection |
| GET/PATCH/DELETE | `/api/suppliers/{id}/` | Supplier details |
| GET/POST | `/api/customers/` | Customer CRUD collection |
| GET/PATCH/DELETE | `/api/customers/{id}/` | Customer details |
| GET | `/api/movements/` | Inventory audit transactions |
| POST | `/api/inventory/adjust/` | Stock-in or stock-out |
| GET/POST | `/api/orders/` | List/create sales orders |
| GET | `/api/orders/{id}/` | Order detail with line items |
| POST | `/api/orders/{id}/fulfill/` | Mark placed order fulfilled |
| POST | `/api/orders/{id}/cancel/` | Cancel placed order; restore stock |
| GET | `/api/reports/?start=YYYY-MM-DD&end=YYYY-MM-DD` | Sales and inventory metrics |
| GET/POST | `/api/users/` | Admin team management |
| GET/PATCH/DELETE | `/api/users/{id}/` | Admin user detail/edit/delete |
| GET | `/api/health/` | Public service status |

DRF list responses are paginated (`results`, `count`, `next`, `previous`); the frontend handles pagination and client filters. SKU is unique. Validation errors return a JSON detail or field error and HTTP 400.

### Example API workflow

**Sign in:**

```http
POST /api/auth/login/
Content-Type: application/json

{"username":"your_admin_username","password":"your_password"}
```

Copy the resulting **access** token into `Authorization: Bearer <access_token>` for authenticated requests.

**Create product** after adding a category:

```http
POST /api/products/
Authorization: Bearer <access_token>
Content-Type: application/json

{"name":"USB-C Dock","sku":"DOCK-001","category":1,"price":"3999.00","cost":"2200.00","low_stock_threshold":5}
```

**Receive stock:**

```http
POST /api/inventory/adjust/
Authorization: Bearer <access_token>
Content-Type: application/json

{"product":1,"movement_type":"in","quantity":50,"note":"Purchase delivery"}
```

**Create order:**

```http
POST /api/orders/
Authorization: Bearer <access_token>
Content-Type: application/json

{"customer":1,"items":[{"product":1,"quantity":2}],"notes":"Deliver this week"}
```

The order records the selling price, creates `OrderItem` and `StockMovement` records, and decreases `Product.stock` by 2 atomically.

## 6. Database schema

See [ER_DIAGRAM.md](ER_DIAGRAM.md) for the complete Mermaid ER diagram and relationship description.

## 7. Deployment guidance

1. Create a managed PostgreSQL database, then set `DATABASE_URL` on your Python host.
2. Deploy `backend` as a Python web service using `pip install -r requirements.txt && python manage.py migrate && python manage.py collectstatic --noinput` and start with `gunicorn config.wsgi:application`.
3. Set `DJANGO_SECRET_KEY` to a generated high-entropy secret, `DJANGO_DEBUG=False`, `DJANGO_ALLOWED_HOSTS` to the API host, and `CORS_ALLOWED_ORIGINS` to your frontend HTTPS domain.
4. Create a production admin using a secure command/terminal on the server. Do not expose the demo seed account publicly.
5. Deploy `frontend` as a Vite static site: build `npm run build`, publish `dist`, set `VITE_API_URL=https://YOUR-API-HOST/api`. SPA fallback rule is included in `frontend/vercel.json`.
6. Confirm all endpoints, auth, permissions, migrations, real order/stock behavior, HTTPS, and mobile responsiveness on production.

**Security checklist:** avoid committing `.env`, use HTTPS for production, never expose Django debug mode or default passwords, restrict allowed CORS origins and hosts. This prototype stores JWT tokens in `sessionStorage`; it is suitable for a time-boxed assessment but a hardened production deployment should use an HttpOnly secure refresh-cookie strategy (with appropriate CSRF protections), CSP, and dedicated audit/security review.

## 8. QA

The repository contains Django API tests for auth basics, role permissions, duplicate SKUs, stock validation, order-stock deduction/restocking, product stock immutability, dashboard and reports. Execute:

```powershell
cd backend
python manage.py test
```

Check frontend syntax/types and build:

```powershell
cd frontend
npm run typecheck
npm run build
```

**Current verification:** Python syntax compilation passed; TypeScript/TSX parse checks passed. Django API tests and npm production build were *not* executed during package creation because Django/React dependencies could not be downloaded in this environment. Do not report tests as passed until your own environment executes them successfully.

## 9. Suggested assessment demo

Record a short screen capture showing: login → overview → add category and product → stock-in → create customer → place order → observe automatic stock deduction → fulfill/cancel another order → verify updated audit log → reports/date filtering → Swagger API docs → Android app (separate deliverable) → hosted URLs.

## 10. Project layout

```
smartstock_web/
├── README.md
├── ER_DIAGRAM.md
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── config/           # settings, URLs, WSGI
│   ├── accounts/         # JWT session, custom user model, admin role
│   └── inventory/        # catalog, orders, stock, reports, tests, migrations
└── frontend/
    ├── index.html
    ├── package.json
    ├── .env.example
    ├── vercel.json
    └── src/
        ├── App.tsx, auth.tsx, api.ts, styles.css
        ├── components/   # sidebar, UI primitives
        └── pages/        # Login, Dashboard, Products, Inventory,
                          # Orders, Contacts, Categories, Reports, Team
```

## Integration note for your previous SmartStock work

You previously started a Django backend locally. **This is a complete new standalone version**, not a patch to that existing repository. Back up your current work first, run this version with a fresh local SQLite database, then selectively merge functionality after comparing models/routes. Never replace a live PostgreSQL schema or migration history without a migration plan.
