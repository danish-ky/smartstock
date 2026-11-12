# SmartStock 5-feature upgrade — preserve your existing project

This is an **incremental patch** for the original SmartStock package. It changes only specific portions of existing files and creates new files. It **does not** replace your local `.env`, `settings.py`, PostgreSQL database, or the API documentation fix you applied earlier.

## 1. Make a backup (Windows PowerShell)

Close your running backend/frontend terminals before changing code. In a fresh PowerShell terminal:

```powershell
cd D:\Inventory_Management
Copy-Item -Recurse -Force smartstock_web smartstock_backup_before_billing
```

If your project is already tracked with Git, a clean commit is also recommended.

## 2. Apply the patch

Download `SmartStock_5_Feature_Upgrade.patch` to `D:\Inventory_Management\smartstock_web\`. From PowerShell:

```powershell
cd D:\Inventory_Management\smartstock_web
git apply --check .\SmartStock_5_Feature_Upgrade.patch
```

**If this reports an error, stop.** Your local code differs from the ZIP used for the patch; do not overwrite your working project or use `--reject` blindly. Instead share the failing file/hunk details (not secrets) to reconcile the change.

When the check succeeds:

```powershell
git apply .\SmartStock_5_Feature_Upgrade.patch
```

The patch was compatibility-tested against the original downloaded SmartStock ZIP **and** against the same ZIP after applying the previously supplied OpenAPI warning fix. It was not tested against your exact Windows files.

## 3. Update backend dependencies, database

```powershell
cd D:\Inventory_Management\smartstock_web\backend
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate
python manage.py test
python manage.py spectacular --file schema.yaml --validate
python manage.py runserver
```

This adds two tables: `inventory_payment` and `inventory_razorpayattempt`. The existing PostgreSQL credentials in your `.env` stay untouched. If `makemigrations --check --dry-run` reports model changes, review those before migrating.

## 4. Set up frontend

In a second terminal:

```powershell
cd D:\Inventory_Management\smartstock_web\frontend
npm.cmd install
npm.cmd run build
npm.cmd run dev
```

Open http://localhost:5173/ and log in as Manager or Admin.

## 5. Try each new feature

- **Product barcode**: Products → each row's **Label** → Download SVG. The label encodes the unique SKU as Code 128 (internal stock label, **not** an official retail GTIN).
- **Scan barcode**: Products → **Scan barcode** → grant camera access → scan the label to filter the list. Webcam usage requires localhost or HTTPS. Hardware USB scanners can type into Product Search without camera permissions.
- **Invoice PDF**: Orders → open an order → **Invoice PDF**. This is a **demo invoice**, not a GST-compliant tax invoice; complete legal invoice fields before real business use.
- **Manual payment status**: Orders → open an order → **Record payment** → enter cash/UPI/card/bank amount. The order shows Unpaid/Partial/Paid and the received amount. It maintains a history of payment records at `GET /api/orders/{id}/payments/`.
- **Razorpay test payment**: Configure test keys below. Orders → **Razorpay test**. The Django server creates a gateway order, validates returned signature **and** confirms capture using Razorpay's API before recording the payment. Never treat a browser callback alone as proof of payment.

### Razorpay TEST mode only

Create test mode keys in your Razorpay account. Add to your existing `backend/.env` (do not post these to chat, GitHub or screenshots):

```dotenv
RAZORPAY_KEY_ID=rzp_test_your_test_key_id
RAZORPAY_KEY_SECRET=your_test_secret
RAZORPAY_WEBHOOK_SECRET=your_separate_webhook_secret
SMARTSTOCK_BUSINESS_NAME=SmartStock Demo
```

Test mode key ID **must** start with `rzp_test_`. Real-money checkout is intentionally disabled. This is for an internship demonstration; do not switch to live keys without payment, refund, reconciliation, and deployment security reviews.

**Webhook:** Only configure the endpoint `https://YOUR-API-HOST/api/razorpay/webhook/` after you deploy the backend over HTTPS. Subscribe to `payment.captured` and set the same `RAZORPAY_WEBHOOK_SECRET` on your backend and in the Razorpay dashboard. This helps reconcile checkout callbacks lost when the browser closes. Do not publicly expose your local development server just to add a webhook.

### Important behavior

- Stock reduces when an order is created, **not** when payment is made. Recorded payments never change stock.
- To prevent unintended stock restoration while money is outstanding, cancellation of orders with recorded payments **or unresolved Razorpay attempts** is blocked. Real refunds and attempt expiration/reconciliation remain outside this two-day demo version.
- Sales reports continue to show orders placed/fulfilled, not merely collected payments. Distinguish **order value** from **cash received**.
- The barcode reader currently searches Products. It does not yet automate quantity entry into stock-in or mobile ordering.

## 6. Security and final testing

Check that regular users cannot access invoices or payment APIs. Check that partial payments and overpayments behave correctly. Verify manual cancellations of unpaid orders still restore stock. Do at least one Razorpay TEST payment using test credentials and confirm the order's payment status changes to Paid. Re-run `python manage.py test` and `npm.cmd run build` after any fixes.

## 7. Remaining Codebxo priorities (two-day plan)

**First day:** Integrate and verify this addon; deploy Django + hosted PostgreSQL + React; confirm HTTPS/API URLs, permissions and order flow.

**Second day:** Finish the **essential Android application** (login, list/search products, stock-in/out, create/view orders) against the same hosted API; create the APK; README, API docs, ER diagram, demonstration recording and submission. The Android app does **not** need a new payment gateway integration to satisfy Codebxo's original requirements.

## Verified vs not verified

- **Verified in authoring environment:** Python syntax compilation; TypeScript syntactic parsing; `git apply --check` against the original source, with and without the prior OpenAPI fix; ZIP integrity.
- **Not verified here:** Django migrations on your PostgreSQL instance, automated Django tests, TypeScript typecheck/Vite production build, browser camera, Razorpay test checkout, PDF download or complete end-to-end user flows. The authoring environment could not reach dependency registries.
