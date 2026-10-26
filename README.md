# SmartBill Pro — GST Billing & Inventory Management System

[![Test Suite](https://img.shields.io/badge/Vitest-21%20Passed-emerald.svg)](#test-suite-and-acceptance-verification)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows-blue.svg)](#installation--running)
[![Storage](https://img.shields.io/badge/Database-SQLite%20(WAL%20Mode)-purple.svg)](#offline-database-architecture)
[![Precision](https://img.shields.io/badge/Money-Decimal%20Paise%20(1%20INR%20%3D%20100)-amber.svg)](#tax-engine--exact-money-arithmetic)

A complete, offline-first, desktop application for GST billing, inventory management, customer ledger tracking, and dual-mode print production. Designed for enterprise stability and tailored to real-world business operations in India.

---

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Visual Reference & Client Form Alignment](#visual-reference--client-form-alignment)
3. [Administrator Verification Workflow](#administrator-verification-workflow)
4. [Tax Engine & Exact Money Arithmetic](#tax-engine--exact-money-arithmetic)
5. [Stock-Safe Invoicing Lifecycle](#stock-safe-invoicing-lifecycle)
6. [Dual Print Engine](#dual-print-engine)
7. [Offline Database Architecture](#offline-database-architecture)
8. [Test Suite and Acceptance Verification](#test-suite-and-acceptance-verification)
9. [Installation & Running](#installation--running)
10. [Packaging for Linux & Windows](#packaging-for-linux--windows)
11. [Backup & Disaster Recovery](#backup--disaster-recovery)

---

## System Architecture

SmartBill Pro strictly separates renderer presentation from persistence and native hardware access through a secure Electron architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                       React 18 Frontend                     │
│  - Vite + React 18 + TypeScript + Tailwind CSS               │
│  - Recharts for visual analytics                            │
│  - Responsive Navigation & Dynamic Invoicing UI             │
│  - Full A4 & Calibrated Overlay Print Layouts               │
└──────────────────────────────▲──────────────────────────────┘
                               │ typed IPC via contextBridge
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Electron Preload Layer                   │
│  - Context Isolation: ENABLED                               │
│  - Node Integration: DISABLED                               │
│  - Secure White-listed API (`window.smartBillApi`)          │
└──────────────────────────────▲──────────────────────────────┘
                               │ IPC Handlers
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Electron Main Process                     │
│  - SQLite Database (`better-sqlite3`) with WAL & FK         │
│  - Central Decimal-safe Tax & Paired Paise Calculations     │
│  - Atomic Transactional Stock-Deduction Engine              │
│  - Audit Logging & Atomic Backup Subsystem                  │
│  - Native PDF & Silent / Calibrated Printer Subsystem       │
└─────────────────────────────────────────────────────────────┘
```

---

## Visual Reference & Client Form Alignment

The application was built against the client's physical invoice form and rubber stamp seal:
1. **Header Reference**:
   - Initial Name: `K.N. 181. Kanyakumari Mahathma Gandhi Human Resource Management & Skill Development Co-operative Society Ltd.`
   - Address: `12-145, 142G/1, S.A. Complex, Pampanvilai Road, Asaripallam, Kanyakumari Dist., PIN 629201`
   - State: `Tamil Nadu` (Code: `33`)
   - Default GSTIN: `33AAKAK0961H1ZP`
2. **Table Columns (7 Distinct Columns with Rupee/Paise Splits)**:
   - Sl. No.
   - Unit
   - Name of Product / Service
   - Qty.
   - Rate Per Unit (Rs. & Ps.)
   - GST %
   - Amount (Rs. & Ps.)
3. **Bottom Ledger Summary**:
   - Total in Words
   - Transport Charges (Rs. & Ps.)
   - Total Value (Rs. & Ps.)
   - Customer Signature & Authorized Signatory Boxes
4. **Circular Seal**:
   - Authenticated circular Tamil society stamp (`K. No. 181`) positioned in the signature box.

---

## Administrator Verification Workflow

To guarantee legal safety and compliance, **client identity details are never permanently hardcoded in the source code**. 

1. **Initial Unverified State**:
   Upon first launch, the company profile has `verified_by_admin = false`.
   A prominent amber warning banner appears across the dashboard and invoicing headers:
   > ⚠️ **Company Profile Requires Administrator Verification**: Please review and verify the legal company name, address, GSTIN, and tax settings in **Company Settings** before issuing production invoices.
2. **Verification Modal / Toggle**:
   The administrator navigates to **Settings -> Company & GST Settings**, verifies the legal registered name, address, and GSTIN against official GST portal certificates, uploads official digital signatures/seals if desired, and clicks **"Verify & Confirm Details"**.
3. **Audit Trail**:
   All modifications and verification events are recorded in the `audit_logs` table with timestamp and user ID.

---

## Tax Engine & Exact Money Arithmetic

Money calculations never use floating-point numbers. Every monetary amount is calculated using `decimal.js` (precision 28, half-up rounding) and persistently stored as **integer paise** (1 INR = 100 paise).

### Calculation Rules
- **Intra-State Supplies (`supplier_state_code == place_of_supply_state_code`)**:
  - GST split equally into CGST and SGST/UTGST.
  - Odd-paise handling: `floor(total_tax / 2)` to CGST, balance to SGST, guaranteeing zero lost or duplicated paise.
- **Inter-State Supplies (`supplier_state_code != place_of_supply_state_code`)**:
  - Whole tax assigned to IGST; CGST and SGST remain 0.
- **Exclusive Pricing**:
  - `taxable_value = quantity * unit_rate`
  - `tax = taxable_value * (gst_rate / 100)`
  - `line_total = taxable_value + tax`
- **Inclusive Pricing (Reverse Calculation)**:
  - `taxable_value = line_total / (1 + gst_rate / 100)`
  - `tax = line_total - taxable_value`
- **Transport Charges**:
  - Taxed according to configured freight GST rate (or exempt/nil-rated).
- **Invoice Discounts**:
  - Subtracted proportionally before GST calculation to prevent double taxation.

---

## Stock-Safe Invoicing Lifecycle

Stock consistency is strictly enforced through atomic SQLite transactions:

```
                  ┌──────────────┐
                  │ DRAFT INVOICE│  (Stock unchanged; 0 movement)
                  └──────┬───────┘
                         │
                 Finalize Invoice
                         │
                         ▼
                  ┌──────────────┐
                  │ISSUED INVOICE│  (Atomic stock deduction; SALE audit log)
                  └──────┬───────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
    Record Payment                 Cancel Invoice
          │                             │
          ▼                             ▼
    ┌───────────┐               ┌───────────────┐
    │PAID STATUS│               │CANCELLED ORDER│  (Atomic stock reversal;
    └───────────┘               └───────────────┘   mandatory reason required;
                                                    double-cancel blocked)
```

1. **Draft Invoices**:
   - Saving a draft **never** reduces inventory stock.
2. **Invoice Finalization**:
   - In a single atomic transaction: checks available stock, deducts physical goods quantity, generates `SALE` movement records in `stock_movements`, updates invoice status to `ISSUED` (or `PAID`/`PARTIALLY_PAID`), and logs the audit event.
   - **Double-Finalization Protection**: Finalizing an already issued invoice throws an error and prevents duplicate stock deductions.
3. **Insufficient Stock Rejection**:
   - Attempting to finalize an invoice with quantities exceeding available stock throws an error without deducting any inventory.
4. **Non-Stock Services**:
   - Items with `type = 'SERVICE'` are exempted from stock validation and deduction.
5. **Invoice Cancellation**:
   - Can only be performed on non-cancelled invoices.
   - Requires a mandatory audit reason.
   - Atomically restores physical goods quantities with a `CANCELLATION_REVERSAL` movement record.
   - Re-attempting cancellation on an already cancelled invoice fails safely without duplicate stock restoration.

---

## Dual Print Engine

SmartBill Pro supports two print modes:

### Mode A: Full Professional A4 Laser/Inkjet Invoice
- Renders complete company branding, customer details, HSN/SAC table, GST breakup summary, bank payment instructions, amount in words, terms, and digital seal/signature.
- Designed for blank standard A4 paper.

### Mode B: Pre-Printed Paper Form Overlay (Calibrated)
- Designed to print directly onto the client's physical pre-printed paper invoice pad.
- **Variable Data Only**: Omits duplicate table borders, column titles, and company headers.
- **Millimeter-Accurate Coordinates**: Custom X/Y positions for invoice number, date, customer info, table rows, amount splits (Rs. / Ps.), total in words, and signature seal.
- **Interactive Calibration Screen**: Visual alignment overlay where the original reference invoice photograph is projected behind the variable fields, allowing administrators to calibrate X/Y millimeter offsets (`offsetXmm`, `offsetYmm`) and line heights.

---

## Offline Database Architecture

The application operates 100% offline using SQLite via `better-sqlite3`:
- **File Location**: Stored in Electron's persistent `app.getPath('userData')` directory (e.g., `~/.config/smartbill-pro/smartbill.db` on Linux, `%APPDATA%\smartbill-pro\smartbill.db` on Windows).
- **Reliability Settings**:
  - `PRAGMA journal_mode = WAL;` (Write-Ahead Logging for high concurrency and crash safety).
  - `PRAGMA foreign_keys = ON;` (Strict relational integrity).
- **Data Tables**:
  - `company_settings`: Company profile, GSTIN, bank details, overlay coordinates.
  - `users`: User authentication with PBKDF2 salt hashing and role-based permissions (`ADMIN`, `OPERATOR`).
  - `products`: Product master (SKU, HSN, rates, stock, physical goods vs. services).
  - `customers` & `suppliers`: Client and vendor directories.
  - `invoices` & `invoice_items`: Complete billing records with paise amounts and tax breakdowns.
  - `purchases` & `purchase_items`: Vendor purchase orders and stock receipts.
  - `stock_movements`: Immutable stock movement ledger (`OPENING`, `SALE`, `PURCHASE`, `ADJUSTMENT_ADD`, `ADJUSTMENT_SUB`, `CANCELLATION_REVERSAL`).
  - `payments`: Customer invoice payment receipts.
  - `audit_logs`: Detailed compliance audit trail.

---

## Test Suite and Acceptance Verification

The system includes a comprehensive Vitest test suite with **21 automated tests** covering all 14 mandatory acceptance criteria:

```bash
mise exec -- npm run test
```

### Test Coverage Summary:
- **Test 1**: Exclusive price intra-state GST calculation (Rs. 1,000 @ 18% -> Rs. 90 CGST, Rs. 90 SGST, Rs. 1,180 Total).
- **Test 2**: Stock reduction on finalized invoice (100 units - 7 units = 93 units).
- **Test 3**: Draft invoice creation (zero stock deduction; balance remains 100).
- **Test 4**: Insufficient stock rejection (safely throws when requested > available).
- **Test 5**: Invoice cancellation restores stock and prevents duplicate reversal.
- **Test 6**: Inclusive price intra-state reverse tax derivation (Rs. 1,180 inc 18% -> Rs. 1,000 taxable + Rs. 180 GST).
- **Test 7**: Inter-state IGST calculation (Rs. 1,000 @ 18% -> Rs. 180 IGST, 0 CGST/SGST).
- **Test 8**: Multiple GST rates on one invoice (5%, 12%, 18%, 28%) with accurate tax breakup reconciliation.
- **Test 9**: Odd-paise tax splitting deterministic balance without tax discrepancy.
- **Test 10**: Indian numbering currency in words formatting (crores, lakhs, thousands, rupees, and paise).
- **Test 11**: Database persistence across application restarts (close, reload, verify records).
- **Test 11 (Extended)**: Non-stock service invoicing (services do not require or deduct stock).
- **Test 12**: Print layout overlay configuration & boundary validation within A4 limits.
- **Test 13**: Double-finalization retry protection (safely blocks double stock deduction).
- **Test 14**: Atomic database backup, integrity verification (`PRAGMA integrity_check`), and restore.

---

## Installation & Running

### Prerequisites
- Node.js v22.x LTS (configured via `mise` or system package manager)
- npm v10.x

### Quick Start (Development)
```bash
# 1. Clone repository and navigate to workspace
cd /home/naveen/.gemini/antigravity/scratch/smartbill-pro

# 2. Install dependencies
mise exec -- npm install

# 3. Build the application (Vite renderer + TypeScript electron)
mise exec -- npm run build

# 4. Launch Desktop App in Development Mode
mise exec -- npm run dev:electron
```

### Running the Packaged Linux Application
```bash
# Direct execution of the unpackaged distribution binary:
./release/linux-unpacked/smartbill-pro

# Or execute the portable AppImage:
chmod +x "release/SmartBill Pro-1.0.0.AppImage"
"./release/SmartBill Pro-1.0.0.AppImage"
```

---

## Packaging for Linux & Windows

SmartBill Pro is configured with `electron-builder` to package native installers:

### 1. Build Linux AppImage
```bash
mise exec -- npm run pack:linux
```
Output: `release/SmartBill Pro-1.0.0.AppImage`

### 2. Build Windows Installer (.exe via NSIS)
```bash
mise exec -- npm run pack:win
```
Output: `release/SmartBill Pro Setup 1.0.0.exe`  
*(Configured with custom desktop shortcut, start menu entry, and directory picker).*

---

## Backup & Disaster Recovery

1. **One-Click Backup**:
   - In **Settings -> Backup & Restore**, click **"Create Instant Backup"**.
   - An atomic SQLite backup is saved to the user's chosen folder with a timestamped filename (e.g., `smartbill_backup_2026-10-25_16-20.db`).
2. **Safety Pre-Restore Snapshot**:
   - Before applying any restore file, SmartBill Pro automatically creates a pre-restore fallback snapshot (`smartbill_pre_restore_backup_*.db`).
3. **Integrity Validation**:
   - Restored databases are automatically validated using `PRAGMA integrity_check` before the transaction is finalized.
# bill-Soft
