# kokoregi — A Lightweight POS Register with Self-Order Support

A single-page, browser-based POS (Point of Sale) application designed for small and individual businesses. Built as a static web app with no backend, no build step, and no dependencies.

Features both a staff register interface and a customer self-order interface accessed via QR code, modeled after the Airレジ + Airレジ ハンディ "Self-Order" workflow. Themed in emerald green (CMYK 59 / 6 / 15 / 0).

Live demo: https://shir0907.github.io/regi-app/

---

## Overview

kokoregi covers the daily register workflow plus customer-side self-ordering:

- Order entry and checkout (staff)
- Product and category management
- Daily and per-item sales analytics
- Cash drawer settlement (register close)
- Transaction history and refund handling
- Receipt and invoice issuance
- **Customer self-order via QR code (no app install required)**
- **Call requests (napkin, water, bill, staff) from the customer's phone**
- **Per-table QR generation and management**

All data is stored locally in the browser via `localStorage`. No accounts, no servers, no telemetry.

---

## Two Modes

### Staff Mode (default)

Open the site URL. The staff register interface opens with all administrative screens.

### Customer Self-Order Mode

Append `?customer=1&table=<table-name>` to the URL, or scan a QR code generated from the **Self-Order → Tables / QR** tab in the staff interface.

Example: `https://shir0907.github.io/regi-app/?customer=1&table=A1`

The customer interface is mobile-optimized and presents only:
- Menu browsing with categories, recommended items, all-you-can-eat indicators, and sold-out markers
- Product detail with quantity and variation selection
- Cart and order submission
- Call requests (napkin, water, bill, call staff)

No customer-side payment is performed. Payment is handled by staff at checkout.

---

## Staff Features

### Order Entry and Checkout
- Product tile grid filtered by category
- Cart with per-line quantity and amount editing
- Hold tickets and recall them later
- Discount and surcharge (amount or percent)
- Per-line tax handling (0%, 8%, 10%, or prompt-at-order)
- Inclusive tax and exclusive tax modes
- Tendered amount entry with automatic change calculation
- Multiple payment methods (cash, credit card, e-money, QR, IC, custom)
- Receipt and qualified invoice printing (browser print)

### Self-Order Administration
- Pending order queue with one-tap conversion to a new ticket or appending to the current ticket
- Pending call requests with a single "Handled" action
- Per-table QR code generation, display, and print-out
- Processed history of orders and calls
- Badge counts on the home tile and top navigation
- Cross-tab sync: orders submitted from a customer device on the same browser appear in real time

### Products and Categories
- Categories with color tags and assignable staff
- Products with price, tax rate, stock, barcode, variations, tile color, image URL
- Recommended and all-you-can-eat flags shown on the customer-side menu
- Department keys for variable-price items
- Zero-yen items where price is entered at checkout
- CSV export
- Built-in sample data loader (also seeds tables A1–A3)

### Sales Analytics
- Daily sales grouped by hour, day, month, or year
- Bar chart visualization with KPIs (total, transaction count, average ticket, item count)
- Per-item sales with quantity, revenue, and contribution percentage
- Category filter for per-item view
- CSV export

### Settlement (Register Close)
- Float (change fund) registration and carry-over
- Theoretical drawer balance vs. actual count
- Over/short calculation
- Settlement history log
- Inspection receipt printing

### Transaction History
- Filter by type (sale, refund, void) and date range
- Detail view per transaction
- Receipt reprint
- Refund as negative ticket with automatic stock restoration

### Settings
- Shop information (name, address, phone, invoice registration number)
- Tax mode (inclusive / exclusive), default rate, rounding policy
- Receipt header and footer messages
- Payment method customization
- Self-order enable / disable and confirmation message
- Full data export and import as JSON
- One-click reset

---

## Tech Stack

- HTML, CSS, vanilla JavaScript only
- No framework, no bundler, no build step
- Persistence: browser `localStorage` under key `kokoregi-v1` (auto-migrates from older `kore-regi-v1`)
- QR code rendering: `api.qrserver.com` (image URL only, no script dependency)
- Hosting: any static host (GitHub Pages, Cloudflare Pages, Netlify, Vercel, etc.)

The entire application is three files:

```
regi-app/
├── index.html    # Markup, screens, modals, customer-mode region
├── style.css     # Emerald-green themed styles for both modes
└── app.js        # State management, business logic, customer flow
```

---

## Running Locally

Any static file server works:

```bash
cd regi-app
python3 -m http.server 8765
```

Then open http://127.0.0.1:8765/ for the staff register, or http://127.0.0.1:8765/?customer=1&table=A1 for the customer self-order view.

---

## Deployment

### GitHub Pages

1. Push the repository to GitHub.
2. In repository **Settings → Pages**, set:
   - Source: `Deploy from a branch`
   - Branch: `main` / folder: `/ (root)`
3. The site is published at `https://<user>.github.io/<repo>/` within 1–2 minutes.

### Other Static Hosts

Drop the three files into the root of any static hosting service. No build step or environment variables are needed.

---

## Self-Order on a Single Browser vs Across Devices

The customer-mode and staff-mode pages communicate through `localStorage`. By default, they are synchronized only **within the same browser on the same device** (via the `storage` event).

For a real deployment where customers use their own phones and staff use a tablet, you need a shared backend. The straightforward path:

- Deploy a Cloudflare Worker that holds the shared state (KV or D1).
- Replace `save()` / `load()` to also push/pull to the Worker.
- Customer phones and staff terminals see the same queue.

This requires roughly 150 lines of additional code and a Cloudflare account. See `DOCS.md` for the extension recipe.

For demonstration, single-device use, or kiosk-style setups (customer scans QR on a shared tablet, staff sees orders on the same device in another browser tab), the built-in `localStorage` synchronization is sufficient.

---

## Data Storage and Privacy

- All product, transaction, settlement, self-order, and call-request data is stored in the user's browser via `localStorage`.
- Data is **per-browser and per-device** unless a shared backend is added.
- Clearing the browser cache will erase the data. Use the JSON export in Settings as a periodic backup.
- The application itself makes no external network calls **except** for the QR code image (rendered from `api.qrserver.com` when displaying the per-table QR; the URL encoded in the QR contains only the public page URL and table name, not user data).

---

## Limitations and Caveats

This project is intended as a reference implementation and a lightweight tool for personal or experimental use. Before relying on it for a real business, consider the following:

- **Cross-device self-order requires backend integration.** Out of the box, customer and staff must use the same browser.
- **No cloud sync** of register data.
- **No automatic backup.** Browser data loss is irreversible without the JSON backup.
- **Legal compliance is the operator's responsibility.** Japanese electronic bookkeeping law (電子帳簿保存法), qualified invoice (インボイス) requirements, and tax rate changes are not automatically tracked.
- **No native peripheral integration.** Bluetooth receipt printers, cash drawers, and card readers require additional integration (for example, by wrapping with Capacitor for iOS/Android).
- **No real payment processing.** Payment methods are recorded as labels only. To take actual card or QR payments, integrate a payment service (Stripe, Square, etc.) via a backend proxy such as Cloudflare Workers.
- **QR rendering uses an external image service.** Replaceable with an offline QR library; see DOCS.

For a fully supported production system on iPad or iPhone, consider Airレジ with Airレジ ハンディ + Airペイ.

---

## Possible Extensions

The architecture is intentionally minimal so that integrations can be added without restructuring.

- **Shared backend** (Cloudflare Workers + KV/D1, Supabase, Firebase) for cross-device self-order and multi-terminal staff use
- **External data archival** (Notion, Google Sheets, Airtable) via a Worker proxy
- **Notifications** (Slack, LINE) on incoming self-orders, call requests, or low stock
- **Card-present payments** via Stripe Terminal or Square SDK (requires native wrapper such as Capacitor)
- **Card-not-present payments** via Stripe Checkout links rendered as QR codes
- **PWA installation** by adding a manifest and service worker
- **Offline QR generator** to eliminate the external image dependency

---

## Project Structure

```
regi-app/
├── README.md
├── DOCS.md
├── index.html
├── style.css
└── app.js
```

That is the entire codebase.

---

## License

No license is currently specified. The repository owner retains all rights. Add a license file (for example, MIT) if you plan to allow reuse or contributions.

---

## Acknowledgements

Feature scope and screen organization are modeled after the Airレジ "Quick Setup Guide" and product brochure, plus the Airレジ ハンディ Self-Order feature announced by Recruit (Impress Watch, 2020-07-30), adapted into a self-hosted static implementation. The color palette uses an emerald green derived from CMYK 59 / 6 / 15 / 0 in place of the original cyan accent.
