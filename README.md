# Shop Billing & Inventory Management Application

An enterprise-ready, offline-first, multi-platform shop billing and inventory tracking system built with **React + TypeScript + Vite**, **Tailwind CSS**, **Dexie IndexedDB**, **Python + FastAPI**, and **Supabase PostgreSQL & Storage**. Supports seamless operations across **Web (PWA)**, **Android (Capacitor)**, and **Desktop (Linux & Windows Electron)** with pixel-perfect **A4 portrait invoice reproduction** adhering to Indian GST compliance.

---

## 1. System Architecture & Multi-Platform Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite | Modern POS interface with responsive UI and Lucide icons |
| **Styling** | Tailwind CSS | Clean business dashboard with dedicated A4 print stylesheet |
| **Offline Local DB** | IndexedDB via Dexie | Persistent client-side database shared across Web, Android, and Desktop |
| **Sync Engine** | Custom Bi-directional Reconciler | Durable outbox queue, client UUID idempotency, and concurrent sale conflict detection |
| **Web PWA** | `vite-plugin-pwa`, Service Worker | Offline app shell caching, background sync, installable web application |
| **Android App** | Capacitor 8 | Native Android wrapper with transparent WebView bridge, hardware printing, and APK bundling |
| **Desktop App** | Electron 45, electron-builder | Native desktop wrapper for Linux (`.AppImage`, `.deb`) and Windows (`.exe` NSIS installer) |
| **Backend API** | Python 3.12+, FastAPI | Asynchronous REST API, CORS enabled, input validation |
| **Cloud Database** | Supabase PostgreSQL / SQLAlchemy | Atomic transactional billing, stock deductions, and ledger tracking |
| **Cloud Storage** | Supabase Storage (Private Bucket) | Secure authorized seal storage with backend streaming proxy |
| **Printing** | HTML5 + CSS3 `@media print` | Strict A4 portrait layout with auto-pagination and zero overlap |

---

## 2. Key Features

### 📊 Executive Dashboard
- **Live Metrics**: Displays Total Products, Current Stock Units, Today's Sales (₹), and Bills Generated Today.
- **Offline Calculation**: When offline, metrics are computed directly from the local IndexedDB without interrupting workflow.
- **Low Stock Watchlist**: Proactively highlights items with $\le 5$ units remaining with one-click restocking.
- **Recent Customer Bills**: Quick preview and one-click reprint of recent transactions.

### 📦 Product & Inventory Management
- **Catalog Management**: Product Name, Product Code (SKU), Unit (`Nos`, `Kg`, `Pcs`, `Box`, `Mtr`, `Set`, `Liter`), Selling Price (Base Taxable), and GST Rate ($0\%, 5\%, 12\%, 18\%, 28\%$).
- **Restocking**: Record new shipments arriving from suppliers with notes and reference numbers.
- **Movement Audit Ledger**: Immutable audit log of every stock movement (`INITIAL`, `SALE`, `RESTOCK`, `ADJUSTMENT`, `OFFLINE_SYNC_OVERDRAFT`) with timestamp and running balance.
- **Offline Stock Updates**: Add products and update stock even when disconnected; changes queue in the outbox and sync automatically.

### 🧾 Billing Counter & GST Compliance
- **Base Price Convention**: Product prices entered in the catalog are base taxable values (GST-exclusive), guaranteeing GST is never applied twice.
- **Section 15(3) CGST Act Compliance**: Discounts reduce the taxable value *before* GST computation, ensuring accurate tax calculation and legal compliance.
- **Multi-Rate GST Invoices**: Supports mixed items with different GST rates (e.g., 5%, 12%, and 18%) in a single bill, providing itemized calculations and a combined rate-wise tax summary.
- **Intrastate vs Interstate Tax Routing**:
  - **Intrastate (Supplier State == Customer State, e.g. Tamilnadu Code 33)**: Splits GST equally into **CGST** (50%) and **SGST** (50%).
  - **Interstate (Supplier State != Customer State, e.g. Karnataka Code 29)**: Collects **IGST** (100%) and sets CGST/SGST to ₹0.00.
  - Never charges CGST/SGST together with IGST for the same supply.
- **Non-GST Bill**: Displays `Subtotal`, optional `Transport Charges`, and `Total Amount Payable`. Zero tax collected or displayed.
- **Offline Invoice Numbering & Statutory Rule 46(b)**:
  - When offline, invoices receive a device-specific prefix (e.g. `INV-DEV1-0001`).
  - Settings screen features a prominent statutory callout explaining Rule 46(b) of the CGST Rules, 2017:
    > *"A consecutive serial number not exceeding sixteen characters, in one or multiple series, containing alphabets or numerals or special characters... unique for a financial year."*
- **Quantity Steppers & Cart Controls**: Quick `+` and `-` quantity adjustment buttons alongside direct manual input.
- **Exact Paise Indian Words Conversion**: Generates precise words (e.g. *"Rupees Two Thousand One Hundred and Sixty Only"*).

### 🖨️ Pixel-Perfect A4 Invoice Print
- Replicating the authentic shop invoice reference format:
  - **Left Header**: Shop name, address, GSTIN, email, contact number.
  - **Right Header**: Invoice number, date (`DD/MM/YYYY`), payment mode, state & code.
  - **Customer Box**: `To`, `M/s.`, address, contact, and `Party's GSTIN`.
  - **Items Table**: Sl. No., Unit, Product / Service Description, Qty, Rate Per Unit (`Rs.` & `Ps.`), GST %, Amount (`Rs.` & `Ps.`).
  - **Multi-Rate Summary**: Clear rate-wise breakup table showing Taxable Value, CGST, SGST, IGST, and Total Tax for each rate tier.
  - **Bottom Grid**: Total amount in words, standard Terms & Conditions, Transport Charges, and Total Value.
  - **Signatures**: Customer Signature on the left, Authorised Signature on the right with the uploaded seal rendered cleanly above it.
- **Offline Seal Caching**: Automatically caches the base64 seal in IndexedDB so invoices print with the authorized seal even when completely offline.
- **Safe Reprint Guarantee**: Viewing or reprinting an existing bill NEVER alters stock quantities.

### 🔄 Offline-First Synchronization & Data Safety
- **5-State Connectivity Badge**: Top header displays live connection state:
  1. `Online & Synced` (Green)
  2. `Offline - Local Mode` (Gray)
  3. `Syncing Pending` (Amber)
  4. `Sync Failed` (Red)
  5. `Conflict Requires Attention` (Red Pulsing)
- **Durable Outbox Queue**: All offline actions (invoices, new products, restocks) are persisted to IndexedDB outbox queue.
- **Client UUID Idempotency**: Prevents double-creation of invoices upon network retries or sync restarts.
- **Concurrent Multi-Device Sales Conflict Detection**:
  - When two counters sell the same remaining inventory while offline, server logs the sale with an `OFFLINE_SYNC_OVERDRAFT` movement and flags a `STOCK_SHORTAGE` conflict.
  - Interactive **Conflict Resolution Modal** allows the shop manager to review affected items, view the overdraft, and trigger restocking.
- **Offline JSON Backup & Restore**: Export all locally cached data directly from Settings, and restore with confirmation alerts.

---

## 3. Platform Deliverables & Locations

| Platform | Artifact | File Path | Size |
|---|---|---|---|
| **Web PWA** | App Shell & Assets | `frontend/dist/` | 580 KB |
| **Android** | Debug APK | `frontend/android/app/build/outputs/apk/debug/app-debug.apk` | 4.2 MB |
| **Linux Desktop** | AppImage | `frontend/release/Shop Billing and Inventory-1.0.0.AppImage` | 125 MB |
| **Linux Desktop** | Debian Package | `frontend/release/shop-billing-frontend_1.0.0_amd64.deb` | 100 MB |
| **Windows Desktop** | Portable Executable | `frontend/release/win-unpacked/Shop Billing and Inventory.exe` | 239 MB |
| **Windows Desktop** | NSIS Installer | `frontend/release/Shop Billing and Inventory Setup 1.0.0.exe` | *Build via Windows or Wine* |

---

## 4. Building the Multi-Platform Packages

### 1. Web Progressive Web App (PWA)
```bash
cd frontend
npm run build
```
Generates `dist/sw.js`, `dist/manifest.webmanifest`, and precached bundles.

### 2. Android APK (Capacitor)
Prerequisites: Android SDK (`ANDROID_HOME`) and Java JDK 21.
```bash
cd frontend
# 1. Build web assets & sync to Android project
npm run build
npx cap sync android

# 2. Build debug APK using Gradle
cd android
./gradlew assembleDebug
```
Output: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

### 3. Linux Desktop (AppImage & .deb)
```bash
cd frontend
npm run build:electron:linux
```
Output:
- `frontend/release/Shop Billing and Inventory-1.0.0.AppImage`
- `frontend/release/shop-billing-frontend_1.0.0_amd64.deb`

### 4. Windows Desktop (.exe)
```bash
cd frontend
npm run build:electron:win
```
- Unpacked Windows application: `frontend/release/win-unpacked/Shop Billing and Inventory.exe`
- Self-installing NSIS package: Run `npm run build:electron:win` on a Windows host or CI runner (or install Wine on Linux).

---

## 5. Development Quick Start

### Step 1: Start Backend
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```
- API URL: `http://localhost:8000`
- Swagger Docs: `http://localhost:8000/docs`

### Step 2: Start Frontend
```bash
cd frontend
npm run dev
```
- Frontend POS: `http://localhost:5173`

### Step 3: Run Desktop App in Development Mode
```bash
cd frontend
npm run electron:start
```

---

## 6. Automated Test Suite (15/15 Tests Passing)

Execute the end-to-end automated test suite:
```bash
source backend/.venv/bin/activate
python backend/scripts/run_tests.py
```

### Verified Test Cases:
1. `[PASS] 1. API Health Check passed.`
2. `[PASS] 2. Settings verified: K.N. 181. Kanyakumari Mahathma Gandhi...`
3. `[PASS] 3. Product created: Price ₹1000, 18% GST, Stock: 50.0`
4. `[PASS] 4. Product restocked: New balance 75.0`
5. `[PASS] 5. Overselling successfully prevented: 400 Insufficient stock returned.`
6. `[PASS] 6. GST Tax Invoice (Intrastate): Subtotal: ₹1000.0, CGST: ₹90.0, SGST: ₹90.0, Total GST: ₹180.0, Grand Total: ₹1180.0`
7. `[PASS] 7. GST Tax Invoice (Interstate): Subtotal: ₹1000.0, IGST: ₹180.0, CGST/SGST: ₹0.00, Grand Total: ₹1230.0`
8. `[PASS] 8. Non-GST Bill: Subtotal: ₹1000.0, Tax: ₹0.00, Transport: ₹50.0, Total Amount Payable: ₹1050.0`
9. `[PASS] 9. Stock deducted accurately: Current stock is 72.0 Nos.`
10. `[PASS] 10. Invoice reprint safe: Stock remains exactly 72.0 Nos.`
11. `[PASS] 11. Automated Database & Seal backup verified.`
12. `[PASS] 12. Multi-Rate GST Invoice (5%, 12%, 18%): Subtotal ₹1900.0, CGST ₹130.0, SGST ₹130.0, Total GST ₹260.0, Grand Total ₹2160.0`
13. `[PASS] 13. Discount verified: Base ₹1000 - Discount ₹100 = Taxable ₹900.0, Tax ₹162.0, Total ₹1062.0`
14. `[PASS] 14. Offline Sync Push & Idempotency verified successfully.`
15. `[PASS] 15. Concurrent Sale Conflict Detection verified: Conflict reported correctly ('Concurrent Sale: Low Stock on 'Standard Test Motor'').`

---

## 7. Data Safety, Backup & Supabase Isolation

### Data Safety Guarantee
- **Supabase Isolation**: The backend uses an isolated local database configuration by default (`backend/data/shop_billing.db`) when `DATABASE_URL` is empty. The `Byte Bash Blitz` Supabase project (`isumphrxbmmdrupzjpth`) is strictly protected and never touched.
- **Client-Side Safety**: Shop records are stored persistently in IndexedDB and replicated via transactional sync. Invoices are never lost during offline network outages.
- **Database Backup Scripts**:
  - `python backend/scripts/export_db.py` -> Timestamped JSON export of all database tables.
  - `python backend/scripts/restore_db.py <backup_file>` -> Restores database snapshot with rollback safety.
  - `python backend/scripts/backup_seal.py` -> Extracts authorized seal image to `backend/backups/`.
  - `python backend/scripts/restore_seal.py <image_file>` -> Uploads seal image back to storage.
