import { Contract, Customer, Product } from "../models/index.js";

function requestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function getActiveContracts(customerId, date = new Date()) {
  return Contract.find({
    customerId,
    status: "Active",
    effectiveFrom: { $lte: date },
    effectiveTo: { $gte: date },
  })
    .sort({ effectiveFrom: -1 })
    .populate("prices.productId", "productCode name unit status");
}

export async function getContractPricing({ customerId, contractId, date = new Date() }, session) {
  const [customer, contract] = await Promise.all([
    Customer.findById(customerId).session(session ?? null),
    Contract.findById(contractId).populate("prices.productId", "productCode name unit status").session(session ?? null),
  ]);
  if (!customer || customer.status !== "Active") throw requestError("Active customer not found.", 404);
  if (!contract || String(contract.customerId) !== String(customer._id)) {
    throw requestError("Contract does not belong to this customer.", 404);
  }
  if (contract.status !== "Active" || date < contract.effectiveFrom || date > contract.effectiveTo) {
    throw requestError("Contract is not active for the selected date.");
  }
  const prices = contract.prices.map((price) => {
    if (!price.productId || price.productId.status !== "Active") {
      throw requestError("Contract contains an unavailable product.");
    }
    return {
      productId: price.productId._id,
      productCode: price.productId.productCode,
      productName: price.productName || price.productId.name,
      unit: price.productId.unit,
      unitPrice: price.agreedPrice,
    };
  });
  return { customer, contract, prices };
}

export async function quoteOrder({ customerId, contractId, items, date = new Date() }, session) {
  if (!Array.isArray(items) || items.length === 0) throw requestError("At least one order item is required.");
  const { customer, contract, prices } = await getContractPricing({ customerId, contractId, date }, session);
  const priceById = new Map(prices.map((price) => [String(price.productId), price]));
  const seen = new Set();
  const quotedItems = items.map(({ productId, quantity }) => {
    const key = String(productId);
    if (seen.has(key)) throw requestError("Each product may only appear once in an order.");
    seen.add(key);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw requestError("Order quantities must be positive whole numbers.");
    const productPrice = priceById.get(key);
    if (!productPrice) throw requestError("Product is not priced on this customer contract.");
    const totalPrice = quantity * productPrice.unitPrice;
    if (!Number.isSafeInteger(totalPrice)) throw requestError("Order item total exceeds the supported integer range.");
    return { ...productPrice, quantity, totalPrice };
  });
  const totalAmount = quotedItems.reduce((sum, item) => sum + item.totalPrice, 0);
  if (!Number.isSafeInteger(totalAmount)) throw requestError("Order total exceeds the supported integer range.");
  return { customer, contract, items: quotedItems, totalAmount };
}

export async function getActiveProducts() {
  return Product.find({ status: "Active" }).sort({ name: 1 });
}
