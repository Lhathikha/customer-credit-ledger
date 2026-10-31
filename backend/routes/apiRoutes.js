import { Router } from "express";
import * as api from "../controllers/apiController.js";

const router = Router();

router.get("/dashboard", api.getDashboard);
router.get("/reports/summary", api.getDashboardReports);

router.get("/customers", api.listCustomers);
router.post("/customers", api.createCustomer);
router.get("/customers/:customerId", api.getCustomer);
router.get("/customers/:customerId/ledger", api.getCustomerLedger);
router.get("/customers/:customerId/credit", api.getCustomerCredit);
router.get("/customers/:customerId/summary", api.getCustomerSummary);
router.get("/customers/:customerId/contracts", api.listActiveContractsRoute);
router.get("/customers/:customerId/contracts/:contractId/pricing", api.getContractPricingRoute);

router.get("/products", api.listProducts);
router.post("/products", api.createProduct);

router.get("/contracts", api.listContracts);
router.post("/contracts", api.createContract);

router.get("/orders", api.listOrders);
router.post("/orders/quote", api.previewOrderRoute);
router.post("/orders", api.createOrderRoute);
router.get("/orders/:orderId", api.getOrder);
router.get("/orders/:orderId/remaining", api.getOrderRemaining);
router.post("/orders/:orderId/cancel", api.cancelOrderRoute);

router.get("/shipments", api.listShipments);
router.post("/shipments", api.createShipmentRoute);
router.get("/shipments/:shipmentId", api.getShipment);

router.get("/invoices", api.listInvoices);
router.get("/invoices/:invoiceId", api.getInvoice);

router.get("/payments", api.listPayments);
router.post("/payments", api.createPayment);

router.get("/credit-notes", api.listCreditNotes);
router.post("/credit-notes", api.createCreditNoteRoute);
router.patch("/credit-notes/:creditNoteId/status", api.updateCreditNoteStatus);

export default router;
