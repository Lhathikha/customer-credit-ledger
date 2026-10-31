import { once } from "node:events";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../app.js";

export function createAuthorizedTestApp() {
  return createApp({
    authenticationMiddleware(request, _response, next) {
      request.auth = { oid: "isolated-api-test", roles: ["Admin", "Finance", "Sales", "Warehouse"] };
      next();
    },
  });
}

export async function setupApiTest(t, { seed = false } = {}) {
  const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = replicaSet.getUri(`customer-credit-ledger-api-${Date.now()}`);

  const { connectDatabase, disconnectDatabase } = await import("../config/database.js");
  let server;

  t.after(async () => {
    if (server?.listening) {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    await disconnectDatabase();
    await replicaSet.stop();
  });

  await connectDatabase(process.env.MONGO_URI);
  if (seed) {
    const [{ seedDemo }, { inTransaction }] = await Promise.all([
      import("../seed/seed.js"),
      import("../services/transactions.js"),
    ]);
    await inTransaction(seedDemo);
  }

  server = createAuthorizedTestApp().listen(0);
  await once(server, "listening");
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  async function request(method, path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      data: text ? JSON.parse(text) : null,
    };
  }

  async function createFixture({ creditLimit = 10_000, unitPrice = 1_000 } = {}) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const customerResponse = await request("POST", "/api/customers", {
      customerCode: `QA-C-${unique}`,
      name: `QA Hospital ${unique}`,
      customerType: "Hospital",
      creditLimit,
    });
    const productResponse = await request("POST", "/api/products", {
      productCode: `QA-P-${unique}`,
      name: `QA Product ${unique}`,
      unit: "box",
    });
    if (customerResponse.status !== 201 || productResponse.status !== 201) {
      throw new Error("Unable to create isolated API test customer/product.");
    }

    const contractResponse = await request("POST", "/api/contracts", {
      customerId: customerResponse.data._id,
      contractNumber: `QA-CT-${unique}`,
      prices: [{ productId: productResponse.data._id, agreedPrice: unitPrice }],
      effectiveFrom: "2025-01-01T00:00:00.000Z",
      effectiveTo: "2035-01-01T00:00:00.000Z",
      status: "Active",
    });
    if (contractResponse.status !== 201) {
      throw new Error(`Unable to create isolated API test contract: ${JSON.stringify(contractResponse.data)}`);
    }

    return {
      customer: customerResponse.data,
      product: productResponse.data,
      contract: contractResponse.data,
      unique,
    };
  }

  return { baseUrl, request, createFixture };
}
