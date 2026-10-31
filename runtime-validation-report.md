# Runtime Validation Report

**Generated**: 2026-10-31T17:00:07+05:30  
**Target**: `C:\Users\lhath\OneDrive\Desktop\customer-credit-ledger`

## Summary

| Step | Status | Exit Code | Details |
|---|---|---:|---|
| Project structure | PASS | 0 | Frontend/backend separation and expected backend config, controllers, middleware, models, routes, seed, services, and tests directories verified. |
| Startup and health | PASS | 0 | Backend connected to a seeded ephemeral MongoDB replica set; `GET /api/health` returned HTTP 200 and `database: connected`. Vite served the frontend on port 5173. |
| Integration tests | PASS | 0 | 33 tests passed, 0 failed, 0 skipped. Existing financial workflow/model tests plus three new HTTP-level integration tests ran through the canonical `npm test` command. |
| Frontend lint | PASS | 0 | `npm --prefix frontend run lint` passed. |
| Production build | PASS | 0 | `npm run build` passed. |
| Dependency audit | PASS | 0 | `npm audit` reported zero vulnerabilities. |
| Browser routes | PASS | 0 | All 17 application routes returned HTTP 200, rendered their expected page headings, and showed the connected database state. No uncaught browser errors or console errors were observed on the route sweep. |
| Browser workflows | PASS | 0 | Order quote/create, shipment and automatic invoice, payment allocation, return submission, and credit-note approval completed against the running API. |
| Mobile smoke check | PASS | 0 | At a 390px viewport, document width matched viewport width; mobile navigation opened and navigated to Customers. |

**Overall**: PASS for the exercised development workflows. This is not a production-readiness or security sign-off.

## Project structure assurance

The workspace has separate `backend/` and `frontend/` applications, a root npm workspace/lockfile, and the expected backend folders for `config`, `controllers`, `middleware`, `models`, `routes`, `seed`, `services`, and `tests`. Environment templates are present. No local `.env` files were found; `.gitignore` excludes `.env`, nested `.env` files, build output, and backend local database data.

## Test evidence and scenarios

The canonical `npm test` command completed with **exit code 0**:

```text
# tests 33
# pass 33
# fail 0
# skipped 0
```

New isolated HTTP journey tests were added in:

- `backend/tests/apiOrders.integration.test.js`
- `backend/tests/apiPaymentsReturns.integration.test.js`
- `backend/tests/apiDashboard.integration.test.js`
- Shared ephemeral-replica-set setup: `backend/tests/apiTestHelpers.js`

These are reachable through the existing root `npm test` command. They create uniquely named customers, products, and contracts; exercise Express routes over HTTP; read persisted state back; and stop their MongoDB replica set after each test.

Existing workflow coverage additionally passed for:

- Server-authoritative customer contract pricing and expired contract rejection.
- Exact credit-limit acceptance, over-limit hold decisions, and concurrent order serialization.
- Invoice outstanding and accepted open-order exposure, including no double counting when shipment value transfers into invoice outstanding.
- Partial shipment quantities and totals, subsequent shipment with a separate invoice, excess-shipment rejection, and unique invoice-per-shipment behavior.
- Payment allocation, over-allocation rejection, duplicate transaction prevention, and invoice balance updates.
- Damaged and near-expiry returns; pending/rejected notes not affecting balances; approved notes reducing invoice outstanding; duplicate-return prevention.
- Ledger transaction ordering/running balances, dashboard reconciliation, and idempotent demo seeding.

The HTTP integration tests directly verified partial-shipment exposure of 4,000 paise invoiced plus 6,000 paise open order, totalling 10,000 paise without double counting; after the second shipment, open-order exposure was zero and invoice outstanding was 10,000 paise. They also verified separate 4,000- and 6,000-paise invoices, payment and credit-note balances, ledger running balances, and dashboard/customer summary reconciliation.

## Browser and API evidence

- Readiness endpoint: `GET /api/health` → HTTP 200, `database: connected`.
- Seeded reads: customers (4), products (3), dashboard and dependent records returned from the test database.
- Route sweep: Dashboard, Customers, Products, Contracts, Orders, Create Order, Shipments, Create Shipment, Invoices, Payments, Returns, Credit Notes, Reports, Customer Ledger, Order Detail, Shipment Detail, and Invoice Detail all rendered.
- Browser order flow used City Hospital's active contract; the UI displayed the contract price, quote, available credit, and accepted decision before submitting.
- Browser shipment flow generated a shipment and its invoice; invoice detail displayed the shipment snapshot, subtotal, and outstanding amount.
- Browser payment flow recorded and displayed an allocated receipt. Browser return flow displayed a pending credit note and then an approved state after review; invoice read-back showed the credit and adjusted outstanding.
- A deliberately invalid credit-note approval exceeding the invoice's outstanding balance was rejected with HTTP 409 and a user-visible error. A valid approval succeeded afterward. This rejection is expected business validation, not an unexplained browser failure.
- Browser route and valid-workflow checks recorded no uncaught page errors or console errors.

## Environment and per-capability verdict

```yaml
environment:
  docker: UNAVAILABLE — `docker info` failed because `docker` is not recognized in this Windows environment.
  node: AVAILABLE — `node --version` returned v22.18.0.
  playwright: AVAILABLE — `npm exec --yes playwright -- --version` returned 1.64.1; Chromium binaries were installed and listed.
  infra-tier: FALLBACK(embedded/in-memory) — Docker is unavailable; MongoMemoryReplSet supplied isolated replica-set transactions.
  browser-tier: PRIMARY(Playwright) — Browser routes and multi-step UI flows were exercised with Chromium.
startup: PASS — seeded ephemeral-database Express startup; `/api/health` returned 200 with database connected; Vite responded on port 5173.
integration: PASS — exit_code: 0, passed: 33, failed: 0, skipped: 0; schema, service, transactional, HTTP API, and reconciliation coverage.
e2e: PASS — exit_code: 0, flows tested: route sweep, order creation, shipment/invoice generation, payment, return and credit-note approval, mobile navigation; test DB/API and browser UI boundaries exercised.
overall: PASS — covered development workflows passed; infrastructure fidelity and security caveats remain.
```

### Known gaps

- Docker was unavailable, so integration ran against `mongodb-memory-server`'s ephemeral single-node replica set rather than a persistent MongoDB Community deployment. Transaction semantics were exercised, but persistent MongoDB installation, durability/restart behavior, and production topology were not validated.
- No local `.env`, `mongod`, or `mongosh` was available/configured. The UI was tested with an ephemeral database and demo seed; its records are temporary.
- The previous Phase 9 security review identified that business APIs do not have authentication/authorization middleware. This was not changed during QA. Protect the APIs before exposing the application or using real customer financial data.
- The workspace contains no Git repository metadata, so branch status and a clean-clone Git checkout were not verified.

## Issues found

| # | Severity | Description | Disposition |
|---|---|---|---|
| 1 | HIGH | Business API routes lack authentication and authorization (known from the prior Phase 9 security review). | Not altered during this QA pass; remains a deployment blocker for network/public use. |
| 2 | INFO | Invalid credit-note approval after partial payment was rejected because the credit exceeded the invoice's remaining balance. | Expected rule enforcement; validated that the UI reports the error and the invoice remains unchanged. |

## Changed files

Only test files were added/adjusted for this QA pass; no production implementation files were changed:

- `backend/tests/apiTestHelpers.js`
- `backend/tests/apiOrders.integration.test.js`
- `backend/tests/apiPaymentsReturns.integration.test.js`
- `backend/tests/apiDashboard.integration.test.js`

One integration-test expectation was aligned with the API's actual conflict status (409) for over-allocation.
