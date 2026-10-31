# Customer Credit & Order Ledger

A full-stack MERN operations workspace for managing healthcare customers,
contract pricing, credit-controlled orders, partial fulfillment, invoices,
payments, returns, credit notes, and customer ledgers.

## Business solution

The application makes each financial decision from persisted customer, contract,
shipment, invoice, payment, and return records. Orders use contract prices loaded
and revalidated by the API; browser-submitted prices are never trusted.

Credit exposure is calculated as:

```text
outstanding invoice balances
+ remaining value of accepted, not-yet-shipped order quantities
= current credit exposure
```

Held and cancelled orders do not count toward exposure. A projected exposure
equal to the customer's credit limit is accepted; a greater amount is held.
Creating a shipment and its invoice in one MongoDB transaction transfers the
shipped value from open-order exposure to invoice exposure, avoiding double
counting. Payments must be fully allocated to one or more invoices. Pending or
rejected returns do not change balances; an approved credit note reduces the
invoice balance and adds a ledger credit.

All monetary amounts are stored and calculated as integer paise (100 paise = ₹1).
Product names, quantities, and contracted unit prices are snapshotted on orders,
shipments, invoices, and returns so catalog or contract edits cannot rewrite
transaction history. Financial records cannot be deleted through model query
operations; use adjustments/credit notes to preserve audit history.

## Stack

- **Frontend:** React 19, Vite, React Router, Axios, Tailwind CSS v4, Lucide,
  Recharts.
- **Backend:** Node.js 22+, Express 5, Mongoose 9.
- **Database:** MongoDB replica set (required for transactional workflows).
- **Tests:** Node's built-in test runner and `mongodb-memory-server` replica-set
  for isolated database integration scenarios.

## Architecture and folder structure

```text
customer-credit-ledger/
├── backend/
│   ├── config/          # Environment validation and MongoDB lifecycle
│   ├── controllers/     # REST request handlers and database summaries
│   ├── middleware/      # Centralized errors and not-found handling
│   ├── models/          # Nine Mongoose schemas and relationship validation
│   ├── routes/           # Health and business API routes
│   ├── seed/             # Idempotent demo ledger data
│   ├── services/         # Pricing, credit, orders, shipping, financial transactions
│   ├── tests/             # Schema and replica-set workflow tests
│   ├── .env.example
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── api/          # Shared Axios client
│   │   ├── components/   # Tables, forms, status and loading/error UI
│   │   ├── pages/        # ERP pages
│   │   ├── App.jsx       # Navigation and routes
│   │   └── index.css
│   └── .env.example
└── README.md
```

The backend's public entry points are `backend/app.js` and `backend/server.js`.
`backend/src/` retains compatibility re-exports from the initial scaffold.

## Installation and environment

Requirements: Node.js 22 or newer and npm. From the project root:

```powershell
npm ci
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

`backend/.env`:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/customer-credit-ledger?replicaSet=rs0
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

`frontend/.env`:

```dotenv
VITE_API_URL=/api
```

The frontend proxies `/api` to the backend in development. For a separately
hosted API, set `VITE_API_URL` to its base URL and configure `CLIENT_URL` to the
frontend origin. `.env` files and local MongoDB data are excluded from Git;
never add credentials to source control.

## Safe local MongoDB replica set

Transactions are mandatory for accepting orders, recording allocated payments,
creating shipment/invoice pairs, and approving credit notes. These operations
require a MongoDB replica set (or sharded cluster); a standalone MongoDB server
is not sufficient. If the replica-set transaction cannot run, the operation
fails rather than silently falling back to non-atomic writes.

For isolated local development, install MongoDB Community Server and MongoDB
Shell. In a PowerShell terminal from `backend`:

```powershell
New-Item -ItemType Directory -Force .\data\db
mongod --replSet rs0 --dbpath .\data\db
```

In another terminal, initialize the local replica set once:

```powershell
mongosh "mongodb://127.0.0.1:27017/admin" --eval "rs.initiate()"
```

Use the local URI in `backend/.env`. The seed script is intended only for this
isolated development database; do not point it at production or shared data.
`GET /api/health` reports `database: "not_configured"` when `MONGO_URI` is
missing and returns HTTP 503 when a configured database is not connected.

## Run commands

From the project root:

```powershell
npm run dev       # Backend on :5000 and Vite frontend on :5173
npm run dev:api   # Backend only
npm run dev:web   # Frontend only
npm run build     # Production frontend build
npm test          # Backend schema + replica-set workflow tests
npm run seed       # Idempotent demo seed (requires MONGO_URI and replica set)
```

The frontend is a browser application at `http://localhost:5173`; the API health
check is at `http://localhost:5000/api/health`.

## API reference

All endpoints are JSON under `/api`. Collection endpoints return
`{ items, page, limit, total, pages }`; use `page` and `limit` (maximum 100).
Most collection reads support `customerId`, `status`, `from`, and `to` filters
where applicable; customer/product/order lists support `search`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | API and database readiness |
| GET | `/dashboard` | Database-backed KPIs, monthly chart data, recent orders |
| GET | `/reports/summary` | Invoice, outstanding, payment, sales, return totals |
| GET, POST | `/customers` | Customer directory and creation |
| GET | `/customers/:customerId` | Customer details |
| GET | `/customers/:customerId/contracts` | Active effective contracts |
| GET | `/customers/:customerId/contracts/:contractId/pricing` | Contract product prices |
| GET | `/customers/:customerId/credit` | Credit limit, exposure, available credit |
| GET | `/customers/:customerId/summary` | Account rollup |
| GET | `/customers/:customerId/ledger` | Financial ledger (`type`, `from`, `to`) |
| GET, POST | `/products` | Product directory and creation |
| GET, POST | `/contracts` | Contract list and creation |
| GET, POST | `/orders` | Filtered order list and credit-checked creation |
| POST | `/orders/quote` | Server-authored price and credit preview |
| GET | `/orders/:orderId` | Order details and remaining quantities |
| GET | `/orders/:orderId/remaining` | Ordered, shipped, and remaining quantities |
| POST | `/orders/:orderId/cancel` | Cancel an eligible unshipped order |
| GET, POST | `/shipments` | Shipment list and atomic shipment + invoice creation |
| GET | `/shipments/:shipmentId` | Shipment and generated invoice |
| GET | `/invoices` | Filtered invoice list |
| GET | `/invoices/:invoiceId` | Invoice details |
| GET, POST | `/payments` | Payment history and fully allocated payment entry |
| GET, POST | `/credit-notes` | Return claims and credit-note creation |
| PATCH | `/credit-notes/:creditNoteId/status` | Approve or reject a pending note |

Contract, order, invoice, payment, shipment, and ledger identifiers are unique
within their respective transaction collections. Invoice shipment IDs are
unique. Ledger transaction IDs and transaction numbers are idempotently
protected with unique indexes.

## Frontend pages

The responsive light-theme workspace includes Dashboard, Customers, Products,
Contracts/Pricing, Orders, Create Order, Order Details, Shipments, Create
Shipment, Shipment Details, Invoices, Invoice Details, Payments, Returns,
Credit Notes, Customer Ledger, and Reports. The dashboard charts and totals
come from the API; no demo values are hardcoded into production pages. Forms
display API validation errors, and data views include loading, empty, retry,
search/filter, and mutation feedback states.

## Business rules

1. Contract prices are effective-dated and owned by the selected customer.
   The backend computes order line prices and totals in paise.
2. Credit exposure includes unpaid invoice balances and unshipped value of
   accepted orders. Exact-limit orders are accepted; over-limit orders are held.
3. Shipment quantities cannot exceed remaining order quantities. A shipment
   snapshots order prices and is invoiced separately for shipped quantities.
4. Each shipment has at most one invoice. Shipment, invoice, order status,
   and ledger posting commit atomically.
5. Payments must be allocated in full to that customer's invoices; allocation
   cannot exceed outstanding invoice balances.
6. Return quantities and prices must match the original invoice snapshot.
   Only approval changes invoice balances or posts a ledger credit.
7. Ledger debits are invoices; payments and approved credit notes are credits.
   Orders are not posted as financial debits, avoiding double-counting.
8. Mutating financial workflows lock/update the customer within a MongoDB
   transaction to serialize concurrent credit decisions and ledger changes.

## Tests and verification

```powershell
npm test
npm run build
npm --prefix frontend run lint
```

The backend tests include five schema/HTTP checks and isolated database scenarios
running against an ephemeral single-node replica set: pricing, expired
contracts, exact and excess credit, invoice/open-order exposure, exposure
transfer on shipment, partial and second shipments, over-shipping, duplicate
invoices, payment and over-allocation, damaged and near-expiry returns,
pending/rejected/approved credit note behavior, ledger reconciliation,
duplicate transaction prevention, dashboard reconciliation, concurrent credit
decisions, return quantity limits, and idempotent demo seeding.
