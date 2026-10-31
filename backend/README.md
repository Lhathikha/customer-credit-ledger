# Backend setup

The backend is a Node.js/Express API using Mongoose. Monetary fields are integer
paise (100 paise = ₹1); do not store or calculate money as floating-point rupees.
Orders and shipments retain product-name and unit-price snapshots so later catalog
or contract changes do not rewrite historical transactions.

## Local development

1. From the project root, run `npm ci` and `Copy-Item backend\.env.example backend\.env`.
2. Never put production credentials in the development `.env`.
3. Start the API with `npm run dev:api` from the project root. From `backend`,
   `npm run dev` or `npm start` starts the API without file watching; restart
   the API after backend source changes. Without `MONGO_URI`, only the API and
   health endpoint start.
4. Run `npm test` from the project root for schema and isolated replica-set
   workflow tests. The tests do not use the configured development database.
5. Run `npm run seed` from the project root after configuring MongoDB. The seed
   can be rerun safely.

## MongoDB transactions

Invoice creation, payment allocation, credit-note approval, and the sample seed
use MongoDB transactions. MongoDB transactions require a replica set (or a sharded
cluster); a standalone `mongod` will not work for these operations.

For isolated local development, from `backend` create a local data directory with
`New-Item -ItemType Directory -Force .\data\db`, start the replica set with
`mongod --replSet rs0 --dbpath .\data\db`, then initialize it once in another
terminal with `mongosh "mongodb://127.0.0.1:27017/admin" --eval "rs.initiate()"`.
Use `mongodb://127.0.0.1:27017/customer-credit-ledger?replicaSet=rs0` for
`MONGO_URI`. Keep the local data directory out of version control and do not point
the seed at a shared or production database.

The health endpoint is `GET /api/health`. It reports when the database is
unconfigured and returns HTTP 503 when a configured database is not connected.
