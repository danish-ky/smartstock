# Orevon - QA and Verification Report

Updated: November 16, 2026

This report separates confirmed manual checks from automated tests and unverified features. The original November 11 verification report is retained below for historical reference.

## Current verification - 2026-11-16

| Requirement | Status | Evidence |
|---|---|---|
| Hosted PostgreSQL connectivity | PASS - manual | Django successfully connected to the Render PostgreSQL database |
| Production API health | PASS - manual | Hosted `/api/health/` returned HTTP 200 |
| Admin JWT authentication | PASS - manual | Hosted admin login returned JWT tokens |
| Web login and dashboard | PASS - manual | Live Vercel website login and dashboard verified |
| Web Products active/archived selector | PASS - manual visual | Updated live Web Products screen displayed the archived view; retrieval of a real archived record was not tested |
| Web forecast dashboard layout | PASS - manual visual | Redesigned Forecast & Restock Alerts section displayed correctly on the live Vercel dashboard |
| Local forecast refresh endpoint | PASS - manual | Browser Network tab showed GET http://127.0.0.1:8000/api/inventory/forecast/?limit=12 returning HTTP 200; this checked the local Django API, not the production endpoint |
| Category and product creation | PASS - manual | Electronics category and test product created |
| Stock adjustment and audit trail | PASS - manual | Stock-in and stock-out transactions verified |
| Customer creation | PASS - manual | Test customer created through hosted website |
| Sales order stock deduction | PASS - manual | SO-00001 reduced inventory by one unit |
| Updated Android APK build | PASS - build | Expo EAS preview build 0ff1e41b-8046-4d2d-8711-a726b4c5a333 reported Build finished |
| Android installation and launch | PASS - manual | APK installed and login screen displayed on physical device |
| Android authentication | PASS - manual | Admin login opened the Android dashboard |
| Updated Android product screens | PASS - manual visual | New APK installed on a physical Android device; Add/Edit Product headings and Archived Products selector were visible in screenshots |
| Shared Web and Android data | PASS - manual | Dashboard records and inventory quantities matched |
| Android-to-Web stock update | PASS - manual | Android stock adjustment from 3 to 4 units appeared on hosted website |
| Android audit trail | PASS - manual | Adjustment recorded with note Android APK sync test |
| Web TypeScript and production build | PASS - local check | `npm run typecheck` and `npm run build` completed successfully after the forecast redesign (Vite reported a nonblocking chunk-size warning) |
| Mobile TypeScript | PASS - local check | `npx.cmd tsc --noEmit` completed without errors |
| Expo dependencies | PASS - local check | `npx.cmd expo install --check` reported dependencies up to date |
| Swagger documentation | PASS - manual | Production Swagger UI and product endpoint documentation displayed |

## Checks not yet fully verified

| Requirement | Status |
|---|---|
| Full Django automated API test suite | NOT VERIFIED in this report |
| Retrieval of real archived products in Web and Android views | NOT VERIFIED; only the interfaces were visually inspected |
| Archived-product visibility across every role | NOT FULLY TESTED; API role checks for the new views were not run end-to-end |
| Forecast calculation accuracy against known sales samples | NOT VERIFIED; only displayed data and local HTTP 200 refresh were checked |
| Newly created evaluator account login and permissions | NOT CONFIRMED in this report |
| All Admin, Manager, Staff and User permission combinations | NOT FULLY TESTED |
| JWT logout and refresh-token blacklisting | NOT VERIFIED |
| Product, category, customer and supplier complete CRUD coverage | PARTIALLY TESTED |
| Duplicate SKU, invalid input and insufficient stock rejection | NOT VERIFIED |
| Order fulfillment, cancellation and automatic restocking | NOT VERIFIED |
| Purchase-order receiving workflow | NOT VERIFIED |
| Payment processing and Razorpay integration | NOT VERIFIED |
| Complete CSV export and report filtering | NOT VERIFIED |
| Automated accessibility and security tests | NOT VERIFIED |

No test is marked as passed solely because its code exists. No failures were established by the evidence summarized here; unverified features must not be treated as passed.

## Deployment references

- Web: https://orevon-web.vercel.app/login
- API: https://smartstock-rjxl.onrender.com/api/
- Swagger: https://smartstock-rjxl.onrender.com/api/docs/
- Android build: https://expo.dev/accounts/danishky/projects/mobile/builds/0ff1e41b-8046-4d2d-8711-a726b4c5a333
- Repository: https://github.com/danish-ky/smartstock

---

## Historical verification snapshot - November 11, 2026

The following content is the original pre-deployment report. Its NOT TESTED and Android-not-included statements reflect the earlier package state, not the updated verification results above.


Generated: 2026-11-11

## Executed checks

| Check | Result | Evidence |
|---|---|---|
| Python syntax (backend, admin, models, views, services, migrations) | **PASS** | `python -m compileall -q backend` completed without errors |
| TypeScript / TSX syntax parsing (17 source files) | **PASS** | TypeScript `transpileModule` returned zero syntax diagnostics |
| Local import path presence and ZIP packaging | **PASS** | File tree inspected before packaging |

## Runtime checks — not executed in this build environment

Dependency packages could not be fetched from the package registry. **All checks below are NOT TESTED**, not Passed.

| Requirement | Status | Run locally |
|---|---|---|
| Django setup and migration | Not tested | `python manage.py migrate` |
| Registration/admin user provisioning | Not tested | `python manage.py createsuperuser`; admin users API |
| JWT login and token refresh | Not tested | `python manage.py test` and browser login |
| JWT logout blacklist behavior | Not tested | Test `/api/auth/logout/` then refresh token reuse |
| Admin, Manager, Staff, User permissions | Not tested | `python manage.py test`; manual role accounts |
| Product CRUD / search / delete | Not tested | Django test + UI |
| Category CRUD | Not tested | Django test + UI |
| Customer / supplier CRUD | Not tested | Django test + UI |
| Database foreign keys | Not tested | Migrate then invalid reference tests |
| Duplicate SKU / invalid input / insufficient stock | Not tested | Django test + UI |
| Stock in/out and audit trail | Not tested | Django test + UI |
| Orders: place, fulfill, cancel, restore stock | Not tested | Django test + UI |
| Dashboard KPIs | Not tested | Django test + UI |
| Reports and CSV export | Not tested | Manual report and CSV file checks |
| Responsive web / accessibility | Not tested | Real browser at desktop/mobile widths |
| npm typecheck/build | Not tested | `npm run typecheck && npm run build` |
| PostgreSQL connection | Not tested | Set `DATABASE_URL` and migrate |
| Live API/web deployment | Not tested | Deploy to your hosting platform |
| Android APK | Not included | Separate deliverable |

## Important scope boundary

This source package is a functional *implementation draft* with all the specified web/API modules. It is **not warranted production-ready** until the runtime tests and end-to-end QA above pass. The initial database migration files were authored without Django migration runtime available and should be verified with `python manage.py makemigrations --check --dry-run` after installing dependencies.
