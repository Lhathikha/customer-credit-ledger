import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight, BadgeIndianRupee, Boxes, CircleDollarSign, ClipboardList, CreditCard,
  FileText, Plus, RefreshCw, RotateCcw, ShieldCheck, Truck, Users,
} from "lucide-react";
import api, { getErrorMessage } from "../api/client.js";
import { DataTable, TableCard } from "../components/DataTable.jsx";
import {
  EmptyState, ErrorState, FormField, LoadingState, PageHeader, SearchBox, StatusBadge,
} from "../components/ui.jsx";
import { useNotify } from "../hooks/useNotify.js";
import { useResource } from "../hooks/useResource.js";
import { formatDate, formatMoney } from "../lib/format.js";

const itemsOf = (data) => data?.items ?? [];
const numberId = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;
const selectOptions = (items, label = (item) => item.name) => items.map((item) => <option value={item._id} key={item._id}>{label(item)}</option>);
const customerLabel = (customer) => customer ? `${customer.name} · ${customer.customerCode}` : "—";
const DashboardCharts = lazy(() => import("../components/DashboardCharts.jsx"));

function PageSurface({ children }) {
  return <div className="page-content">{children}</div>;
}

function useMutation() {
  const [saving, setSaving] = useState(false);
  const notify = useNotify();
  const run = async (action, successMessage) => {
    setSaving(true);
    try {
      const result = await action();
      notify(successMessage);
      return result;
    } catch (error) {
      notify(getErrorMessage(error), "error");
      return null;
    } finally {
      setSaving(false);
    }
  };
  return { saving, run };
}

function StatCard({ label, value, note, icon: Icon, tone = "blue" }) {
  return <div className="stat-card"><div className={`stat-icon icon-${tone}`}><Icon size={20} /></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>;
}

export function DashboardPage() {
  const { data, loading, error, reload } = useResource("/dashboard");
  const summary = data?.summary;
  const monthly = data?.monthly ?? [];
  const recent = data?.recentOrders ?? [];
  return <PageSurface>
    <PageHeader eyebrow="OVERVIEW" title="Good morning" description="Here is the latest view of your customer credit and order ledger." actions={<button className="button button-secondary" onClick={reload}><RefreshCw size={16} /> Refresh</button>} />
    {loading ? <LoadingState label="Loading dashboard from your ledger..." /> : error ? <ErrorState error={error} onRetry={reload} /> : <>
      <div className="stats-grid">
        <StatCard label="Active customers" value={summary.customers} note="Across all customer accounts" icon={Users} tone="violet" />
        <StatCard label="Orders this period" value={summary.orders} note={`${summary.acceptedOrders} accepted · ${summary.heldOrders} on hold`} icon={ClipboardList} tone="blue" />
        <StatCard label="Invoiced" value={formatMoney(summary.invoicedAmount)} note="For selected reporting period" icon={FileText} tone="cyan" />
        <StatCard label="Outstanding" value={formatMoney(summary.outstandingAmount)} note="Unpaid invoice balance" icon={CircleDollarSign} tone="amber" />
        <StatCard label="Payments received" value={formatMoney(summary.paymentsReceived)} note="Payments in selected period" icon={CreditCard} tone="green" />
        <StatCard label="Approved credits" value={formatMoney(summary.approvedCreditNotes)} note="Returns credited this period" icon={RotateCcw} tone="rose" />
        <StatCard label="Credit exposure" value={formatMoney(summary.creditExposure)} note={`${summary.creditUtilizationPercent.toFixed(1)}% of ${formatMoney(summary.creditLimit)} total limit`} icon={ShieldCheck} tone="indigo" />
        <StatCard label="Open orders" value={summary.openOrders} note="Awaiting fulfillment" icon={Truck} tone="teal" />
      </div>
      <Suspense fallback={<LoadingState label="Loading analytics..." />}><DashboardCharts monthly={monthly} /></Suspense>
      <TableCard title="Recent orders" subtitle="Latest customer activity" action={<Link className="text-link" to="/orders">View all orders <ArrowUpRight size={14} /></Link>}>
        <DataTable rows={recent} columns={[
          { key: "orderNumber", label: "Order" }, { key: "customerId", label: "Customer", render: (row) => row.customerId?.name ?? "—" },
          { key: "orderDate", label: "Order date", render: (row) => formatDate(row.orderDate) }, { key: "status", label: "Status", status: true },
          { key: "totalAmount", label: "Total", numeric: true, render: (row) => formatMoney(row.totalAmount) },
        ]} />
      </TableCard>
    </>}
  </PageSurface>;
}

export function CustomersPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error, reload } = useResource(`/customers?search=${encodeURIComponent(search)}`, refresh);
  const { saving, run } = useMutation();
  return <PageSurface><PageHeader eyebrow="ACCOUNTS" title="Customers" description="Customer accounts, credit limits and ledger positions." actions={<button className="button button-primary" onClick={() => setOpen(!open)}><Plus size={16} /> Add customer</button>} />
    {open && <CustomerForm onCancel={() => setOpen(false)} onSubmit={async (payload) => {
      const result = await run(() => api.post("/customers", payload), "Customer created.");
      if (result) { setOpen(false); setRefresh((value) => value + 1); }
    }} saving={saving} />}
    <div className="toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search customer or code" /></div>
    <TableCard title="Customer directory" subtitle={`${data?.total ?? 0} accounts`}><DataTable rows={itemsOf(data)} loading={loading} error={error} onRetry={reload} columns={[
      { key: "name", label: "Customer", render: (row) => <div className="primary-cell"><strong>{row.name}</strong><small>{row.customerCode}</small></div> },
      { key: "customerType", label: "Type" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
      { key: "creditLimit", label: "Credit limit", numeric: true, render: (row) => formatMoney(row.creditLimit) },
      { key: "status", label: "Status", status: true },
      { key: "ledger", label: "Ledger", render: (row) => <Link className="table-action" to={`/customers/${row._id}/ledger`}>Open ledger <ArrowUpRight size={14} /></Link> },
    ]} /></TableCard>
  </PageSurface>;
}

function CustomerForm({ onSubmit, onCancel, saving }) {
  const [form, setForm] = useState({ customerCode: "", name: "", customerType: "Hospital", email: "", phone: "", address: "", creditLimit: "", status: "Active" });
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = (event) => { event.preventDefault(); onSubmit({ ...form, creditLimit: Math.round(Number(form.creditLimit) * 100) }); };
  return <form className="surface form-panel" onSubmit={submit}><div className="form-grid">
    <FormField label="Customer code"><input required value={form.customerCode} onChange={set("customerCode")} /></FormField>
    <FormField label="Customer name"><input required value={form.name} onChange={set("name")} /></FormField>
    <FormField label="Customer type"><select value={form.customerType} onChange={set("customerType")}><option>Hospital</option><option>Distributor</option></select></FormField>
    <FormField label="Credit limit (₹)"><input required type="number" min="0" step="0.01" value={form.creditLimit} onChange={set("creditLimit")} /></FormField>
    <FormField label="Email"><input type="email" value={form.email} onChange={set("email")} /></FormField>
    <FormField label="Phone"><input value={form.phone} onChange={set("phone")} /></FormField>
    <FormField label="Address" className="span-two"><input value={form.address} onChange={set("address")} /></FormField>
  </div><div className="form-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><button disabled={saving} className="button button-primary">{saving ? "Saving..." : "Create customer"}</button></div></form>;
}

export function ProductsPage() {
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error, reload } = useResource("/products", refresh);
  const { saving, run } = useMutation();
  const [form, setForm] = useState({ productCode: "", name: "", description: "", unit: "unit", status: "Active" });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => { event.preventDefault(); const result = await run(() => api.post("/products", form), "Product created."); if (result) { setForm({ productCode: "", name: "", description: "", unit: "unit", status: "Active" }); setOpen(false); setRefresh((v) => v + 1); } };
  return <PageSurface><PageHeader eyebrow="CATALOG" title="Products" description="Manage the catalog used by contracts, orders and shipments." actions={<button className="button button-primary" onClick={() => setOpen(!open)}><Plus size={16} /> Add product</button>} />
    {open && <form className="surface form-panel" onSubmit={submit}><div className="form-grid"><FormField label="Product code"><input required value={form.productCode} onChange={set("productCode")} /></FormField><FormField label="Name"><input required value={form.name} onChange={set("name")} /></FormField><FormField label="Unit"><input required value={form.unit} onChange={set("unit")} /></FormField><FormField label="Description"><input value={form.description} onChange={set("description")} /></FormField></div><div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Saving..." : "Save product"}</button></div></form>}
    <TableCard title="Product catalog" subtitle={`${data?.total ?? 0} products`}><DataTable rows={itemsOf(data)} loading={loading} error={error} onRetry={reload} columns={[
      { key: "name", label: "Product", render: (row) => <div className="primary-cell"><strong>{row.name}</strong><small>{row.productCode}</small></div> },
      { key: "description", label: "Description" }, { key: "unit", label: "Unit" }, { key: "status", label: "Status", status: true },
    ]} /></TableCard>
  </PageSurface>;
}

export function ContractsPage() {
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error, reload } = useResource("/contracts", refresh);
  const customers = useResource("/customers?limit=100");
  const products = useResource("/products?limit=100");
  const { saving, run } = useMutation();
  const [form, setForm] = useState({ customerId: "", contractNumber: "", effectiveFrom: "", effectiveTo: "", prices: {} });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const setPrice = (id, value) => setForm((current) => ({ ...current, prices: { ...current.prices, [id]: value } }));
  const submit = async (event) => {
    event.preventDefault();
    const result = await run(() => api.post("/contracts", {
      customerId: form.customerId, contractNumber: form.contractNumber, effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo,
      prices: Object.entries(form.prices).filter(([, value]) => value !== "").map(([productId, value]) => ({
        productId, productName: itemsOf(products.data).find((product) => product._id === productId)?.name,
        agreedPrice: Math.round(Number(value) * 100),
      })),
    }), "Contract created.");
    if (result) { setOpen(false); setForm({ customerId: "", contractNumber: "", effectiveFrom: "", effectiveTo: "", prices: {} }); setRefresh((v) => v + 1); }
  };
  return <PageSurface><PageHeader eyebrow="PRICING" title="Contracts & pricing" description="Effective-dated customer-specific product prices." actions={<button className="button button-primary" onClick={() => setOpen(!open)}><Plus size={16} /> New contract</button>} />
    {open && <form className="surface form-panel" onSubmit={submit}><div className="form-grid"><FormField label="Customer"><select required value={form.customerId} onChange={set("customerId")}><option value="">Select customer</option>{selectOptions(itemsOf(customers.data), customerLabel)}</select></FormField><FormField label="Contract number"><input required value={form.contractNumber} onChange={set("contractNumber")} /></FormField><FormField label="Effective from"><input required type="date" value={form.effectiveFrom} onChange={set("effectiveFrom")} /></FormField><FormField label="Effective to"><input required type="date" value={form.effectiveTo} onChange={set("effectiveTo")} /></FormField></div><div className="price-inputs"><strong>Product prices (₹)</strong>{itemsOf(products.data).map((product) => <FormField key={product._id} label={`${product.name} · ${product.unit}`}><input type="number" min="0" step="0.01" value={form.prices[product._id] ?? ""} onChange={(event) => setPrice(product._id, event.target.value)} /></FormField>)}</div><div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Saving..." : "Create contract"}</button></div></form>}
    <TableCard title="Customer contracts" subtitle="Prices are preserved on historical orders"><DataTable rows={itemsOf(data)} loading={loading} error={error} onRetry={reload} columns={[
      { key: "contractNumber", label: "Contract" }, { key: "customerId", label: "Customer", render: (row) => row.customerId?.name ?? "—" },
      { key: "prices", label: "Priced products", render: (row) => row.prices?.length ?? 0 },
      { key: "effectiveFrom", label: "Effective", render: (row) => `${formatDate(row.effectiveFrom)} – ${formatDate(row.effectiveTo)}` },
      { key: "status", label: "Status", status: true },
    ]} /></TableCard>
  </PageSurface>;
}

export function OrdersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const query = new URLSearchParams({ ...(search ? { search } : {}), ...(status ? { status } : {}) });
  const { data, loading, error, reload } = useResource(`/orders?${query}`);
  return <PageSurface><PageHeader eyebrow="SALES" title="Orders" description="Accepted, held and fulfilled customer orders." actions={<Link className="button button-primary" to="/orders/new"><Plus size={16} /> Create order</Link>} />
    <div className="toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search order number" /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["Pending", "Accepted", "On Hold", "Partially Shipped", "Completed", "Cancelled"].map((item) => <option key={item}>{item}</option>)}</select></div>
    <TableCard title="Order book" subtitle={`${data?.total ?? 0} orders`}><DataTable rows={itemsOf(data)} loading={loading} error={error} onRetry={reload} rowLink={(row) => `/orders/${row._id}`} columns={[
      { key: "orderNumber", label: "Order" }, { key: "customerId", label: "Customer", render: (row) => row.customerId?.name ?? "—" },
      { key: "orderDate", label: "Date", render: (row) => formatDate(row.orderDate) }, { key: "status", label: "Status", status: true },
      { key: "totalAmount", label: "Order total", numeric: true, render: (row) => formatMoney(row.totalAmount) },
    ]} /></TableCard>
  </PageSurface>;
}

export function CreateOrderPage() {
  const navigate = useNavigate();
  const customers = useResource("/customers?limit=100");
  const [customerId, setCustomerId] = useState("");
  const [contractId, setContractId] = useState("");
  const [contracts, setContracts] = useState([]);
  const [prices, setPrices] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [quote, setQuote] = useState(null);
  const { saving, run } = useMutation();
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let active = true;
    if (customerId) api.get(`/customers/${customerId}/contracts`).then(({ data }) => { if (active) setContracts(data); }).catch((error) => { if (active) setLoadError(getErrorMessage(error)); });
    return () => { active = false; };
  }, [customerId]);
  useEffect(() => {
    let active = true;
    if (customerId && contractId) api.get(`/customers/${customerId}/contracts/${contractId}/pricing`).then(({ data }) => { if (active) setPrices(data.prices); }).catch((error) => { if (active) setLoadError(getErrorMessage(error)); });
    return () => { active = false; };
  }, [customerId, contractId]);
  const selectedItems = useMemo(() => Object.entries(quantities).filter(([, quantity]) => Number(quantity) > 0).map(([productId, quantity]) => ({ productId, quantity: Number(quantity) })), [quantities]);
  const updateQuantity = (productId, value) => { setQuantities((current) => ({ ...current, [productId]: value })); setQuote(null); };
  const getQuote = async () => {
    setLoadError("");
    try { const { data } = await api.post("/orders/quote", { customerId, contractId, items: selectedItems }); setQuote(data); }
    catch (error) { setLoadError(getErrorMessage(error)); }
  };
  const submit = async (event) => {
    event.preventDefault();
    const result = await run(() => api.post("/orders", { orderNumber: numberId("ORD"), customerId, contractId, items: selectedItems }), "Order saved with the server's credit decision.");
    if (result) navigate(`/orders/${result.data.order._id}`);
  };
  return <PageSurface><PageHeader eyebrow="SALES" title="Create order" description="Prices are loaded from the selected customer contract and validated by the API." />
    <form className="form-layout" onSubmit={submit}>
      <section className="surface form-panel"><h2>Order details</h2><div className="form-grid">
        <FormField label="Customer"><select required value={customerId} onChange={(event) => { setCustomerId(event.target.value); setContractId(""); setContracts([]); setPrices([]); setQuantities({}); setQuote(null); }}><option value="">Select customer</option>{selectOptions(itemsOf(customers.data), customerLabel)}</select></FormField>
        <FormField label="Active contract"><select required value={contractId} onChange={(event) => { setContractId(event.target.value); setPrices([]); setQuote(null); }}><option value="">Select contract</option>{contracts.map((contract) => <option key={contract._id} value={contract._id}>{contract.contractNumber} · until {formatDate(contract.effectiveTo)}</option>)}</select></FormField>
      </div>
        {loadError && <p className="inline-error">{loadError}</p>}
        {!customerId && <EmptyState title="Choose a customer" description="Select a customer to load active contracts and contracted prices." />}
        {customerId && contractId && <div className="price-line-list">{prices.map((product) => <div className="price-line" key={product.productId}><div><strong>{product.productName}</strong><small>{product.productCode} · {formatMoney(product.unitPrice)} / {product.unit}</small></div><input aria-label={`${product.productName} quantity`} type="number" min="0" step="1" value={quantities[product.productId] ?? ""} onChange={(event) => updateQuantity(product.productId, event.target.value)} placeholder="Qty" /></div>)}</div>}
        {selectedItems.length > 0 && <button type="button" className="button button-secondary" onClick={getQuote}>Calculate credit decision</button>}
      </section>
      <aside className="surface quote-card"><div className="quote-icon"><BadgeIndianRupee size={21} /></div><h2>Order summary</h2>{quote ? <>
        <div className="quote-row"><span>Order value</span><strong>{formatMoney(quote.totalAmount)}</strong></div><div className="quote-row"><span>Credit limit</span><strong>{formatMoney(quote.creditLimit)}</strong></div><div className="quote-row"><span>Existing exposure</span><strong>{formatMoney(quote.existingExposure)}</strong></div><div className="quote-row"><span>Available before order</span><strong>{formatMoney(quote.availableCredit)}</strong></div><div className="quote-projection"><span>Projected exposure</span><strong>{formatMoney(quote.projectedExposure)}</strong></div><div className="credit-decision"><StatusBadge value={quote.creditDecision} /> {quote.creditDecision === "Accepted" ? "Within credit terms" : "Order will be placed on hold"}</div>
        <button className="button button-primary button-wide" disabled={saving}>{saving ? "Saving order..." : "Create order"}</button>
      </> : <p className="muted-copy">Select quantities and calculate to preview the contract total and available credit.</p>}</aside>
    </form>
  </PageSurface>;
}

export function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useResource(`/orders/${orderId}`);
  const notify = useNotify();
  const order = data;
  const canCancel = order && ["Accepted", "On Hold"].includes(order.status);
  const canShip = order && ["Accepted", "Partially Shipped"].includes(order.status);
  const cancel = async () => {
    try { await api.post(`/orders/${orderId}/cancel`); notify("Order cancelled."); reload(); }
    catch (e) { notify(getErrorMessage(e), "error"); }
  };
  if (loading) return <PageSurface><LoadingState /></PageSurface>;
  if (error) return <PageSurface><ErrorState error={error} onRetry={reload} /></PageSurface>;
  return <PageSurface><PageHeader eyebrow="ORDER DETAIL" title={order.orderNumber} description={`${order.customerId?.name ?? "Customer"} · placed ${formatDate(order.orderDate)}`} actions={<><StatusBadge value={order.status} />{canCancel && <button className="button button-secondary" onClick={cancel}>Cancel order</button>}{canShip && order.remainingItems?.some((item) => item.remainingQuantity > 0) && <button className="button button-primary" onClick={() => navigate(`/shipments/new?orderId=${order._id}`)}><Truck size={16} /> Create shipment</button>}</>} />
    <div className="detail-grid"><div className="surface detail-summary"><span>Order total</span><strong>{formatMoney(order.totalAmount)}</strong><span>Contract</span><strong>{order.contractId?.contractNumber ?? "—"}</strong><span>Hold reason</span><strong>{order.holdReason || "—"}</strong></div>
      <TableCard title="Ordered items" subtitle="Historical unit prices are retained"><DataTable rows={order.remainingItems} columns={[
        { key: "productName", label: "Product" }, { key: "orderedQuantity", label: "Ordered" }, { key: "shippedQuantity", label: "Shipped" },
        { key: "remainingQuantity", label: "Remaining" }, { key: "unitPrice", label: "Unit price", numeric: true, render: (row) => formatMoney(row.unitPrice) },
        { key: "lineTotal", label: "Line total", numeric: true, render: (row) => formatMoney(row.orderedQuantity * row.unitPrice) },
      ]} /></TableCard></div>
    <TableCard title="Related invoices" subtitle="Invoices are created for each shipment"><RelatedInvoices orderId={order._id} /></TableCard>
  </PageSurface>;
}

function RelatedInvoices({ orderId }) {
  const { data, loading, error, reload } = useResource(`/invoices?orderId=${orderId}`);
  return <DataTable rows={itemsOf(data)} loading={loading} error={error} onRetry={reload} columns={[
    { key: "invoiceNumber", label: "Invoice", render: (row) => <Link className="table-action" to={`/invoices/${row._id}`}>{row.invoiceNumber}</Link> },
    { key: "invoiceDate", label: "Date", render: (row) => formatDate(row.invoiceDate) }, { key: "status", label: "Status", status: true },
    { key: "subtotal", label: "Subtotal", numeric: true, render: (row) => formatMoney(row.subtotal) }, { key: "outstandingAmount", label: "Outstanding", numeric: true, render: (row) => formatMoney(row.outstandingAmount) },
  ]} />;
}

export function ShipmentsPage() {
  const { data, loading, error, reload } = useResource("/shipments");
  return <PageSurface><PageHeader eyebrow="FULFILLMENT" title="Shipments" description="Each shipment produces its own invoice for the shipped quantities." actions={<Link className="button button-primary" to="/shipments/new"><Plus size={16} /> Create shipment</Link>} /><TableCard title="Shipment register" subtitle={`${data?.total ?? 0} shipments`}><DataTable rows={itemsOf(data)} loading={loading} error={error} onRetry={reload} columns={[
    { key: "shipmentNumber", label: "Shipment", render: (row) => <Link className="table-action" to={`/shipments/${row._id}`}>{row.shipmentNumber}</Link> },
    { key: "orderId", label: "Order", render: (row) => row.orderId?.orderNumber ?? "—" }, { key: "shipmentDate", label: "Date", render: (row) => formatDate(row.shipmentDate) },
    { key: "items", label: "Lines", render: (row) => row.items?.length ?? 0 }, { key: "shipmentAmount", label: "Amount", numeric: true, render: (row) => formatMoney(row.shipmentAmount) }, { key: "status", label: "Status", status: true },
  ]} /></TableCard></PageSurface>;
}

export function CreateShipmentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [orderId, setOrderId] = useState(searchParams.get("orderId") ?? "");
  const orders = useResource("/orders?status=Accepted&limit=100");
  const partial = useResource("/orders?status=Partially%20Shipped&limit=100");
  const [remaining, setRemaining] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [errorText, setErrorText] = useState("");
  const { saving, run } = useMutation();
  const selectableOrders = [...itemsOf(orders.data), ...itemsOf(partial.data)];
  useEffect(() => {
    let active = true;
    if (orderId) api.get(`/orders/${orderId}/remaining`).then(({ data }) => { if (active) setRemaining(data); }).catch((error) => { if (active) setErrorText(getErrorMessage(error)); });
    return () => { active = false; };
  }, [orderId]);
  const submit = async (event) => {
    event.preventDefault(); setErrorText("");
    const items = Object.entries(quantities).filter(([, q]) => Number(q) > 0).map(([productId, q]) => ({ productId, shippedQuantity: Number(q) }));
    const result = await run(() => api.post("/shipments", { shipmentNumber: numberId("SHP"), invoiceNumber: numberId("INV"), orderId, items }), "Shipment saved and invoice created.");
    if (result) navigate(`/shipments/${result.data.shipment._id}`);
  };
  return <PageSurface><PageHeader eyebrow="FULFILLMENT" title="Create shipment" description="Select a fulfillable order, then enter quantities to ship." />
    <form className="surface form-panel" onSubmit={submit}><div className="form-grid"><FormField label="Accepted order"><select required value={orderId} onChange={(event) => { setOrderId(event.target.value); setRemaining(null); setQuantities({}); setErrorText(""); }}><option value="">Select order</option>{selectableOrders.map((order) => <option key={order._id} value={order._id}>{order.orderNumber} · {order.customerId?.name ?? "Customer"} · {order.status}</option>)}</select></FormField></div>
      {errorText && <p className="inline-error">{errorText}</p>}
      {remaining && <><div className="table-scroll"><table className="data-table"><thead><tr><th>Product</th><th>Ordered</th><th>Shipped</th><th>Remaining</th><th>Price</th><th>Ship now</th></tr></thead><tbody>{remaining.items.map((item) => <tr key={item.productId}><td>{item.productName}</td><td>{item.orderedQuantity}</td><td>{item.shippedQuantity}</td><td>{item.remainingQuantity}</td><td>{formatMoney(item.unitPrice)}</td><td><input aria-label={`${item.productName} quantity to ship`} className="quantity-input" type="number" min="0" max={item.remainingQuantity} step="1" value={quantities[item.productId] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.productId]: event.target.value }))} /></td></tr>)}</tbody></table></div><div className="form-actions"><Link className="button button-secondary" to="/shipments">Cancel</Link><button className="button button-primary" disabled={saving}>{saving ? "Creating..." : "Create shipment & invoice"}</button></div></>}
      {!remaining && !orderId && <EmptyState title="Select an order" description="Remaining quantities and order price snapshots will appear here." />}
    </form>
  </PageSurface>;
}

export function ShipmentDetailPage() {
  const { shipmentId } = useParams();
  const { data, loading, error, reload } = useResource(`/shipments/${shipmentId}`);
  if (loading) return <PageSurface><LoadingState /></PageSurface>;
  if (error) return <PageSurface><ErrorState error={error} onRetry={reload} /></PageSurface>;
  const { shipment, invoice } = data;
  return <PageSurface><PageHeader eyebrow="SHIPMENT DETAIL" title={shipment.shipmentNumber} description={`Shipment date ${formatDate(shipment.shipmentDate)}`} actions={<StatusBadge value={shipment.status} />} /><div className="detail-grid"><TableCard title="Shipped items"><DataTable rows={shipment.items} columns={[{ key: "productName", label: "Product" }, { key: "shippedQuantity", label: "Quantity" }, { key: "unitPrice", label: "Unit price", numeric: true, render: (row) => formatMoney(row.unitPrice) }, { key: "shipmentAmount", label: "Amount", numeric: true, render: (row) => formatMoney(row.shipmentAmount) }]} /></TableCard><div className="surface detail-summary"><span>Order</span><Link className="table-action" to={`/orders/${shipment.orderId?._id}`}>{shipment.orderId?.orderNumber}</Link><span>Shipment total</span><strong>{formatMoney(shipment.shipmentAmount)}</strong><span>Invoice</span>{invoice ? <Link className="table-action" to={`/invoices/${invoice._id}`}>{invoice.invoiceNumber}</Link> : <strong>—</strong>}</div></div></PageSurface>;
}

export function InvoicesPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const { data, loading, error, reload } = useResource(`/invoices${status ? `?status=${encodeURIComponent(status)}` : ""}`);
  return <PageSurface><PageHeader eyebrow="RECEIVABLES" title="Invoices" description="Shipment-backed invoices and open customer balances." /><div className="toolbar"><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["Unpaid", "Partially Paid", "Paid"].map((item) => <option key={item}>{item}</option>)}</select></div><TableCard title="Invoice register" subtitle={`${data?.total ?? 0} invoices`}><DataTable rows={itemsOf(data)} loading={loading} error={error} onRetry={reload} columns={[
    { key: "invoiceNumber", label: "Invoice", render: (row) => <Link className="table-action" to={`/invoices/${row._id}`}>{row.invoiceNumber}</Link> }, { key: "customerId", label: "Customer", render: (row) => row.customerId?.name ?? "—" },
    { key: "invoiceDate", label: "Date", render: (row) => formatDate(row.invoiceDate) }, { key: "subtotal", label: "Subtotal", numeric: true, render: (row) => formatMoney(row.subtotal) },
    { key: "paidAmount", label: "Paid", numeric: true, render: (row) => formatMoney(row.paidAmount) }, { key: "outstandingAmount", label: "Outstanding", numeric: true, render: (row) => formatMoney(row.outstandingAmount) }, { key: "status", label: "Status", status: true },
  ]} /></TableCard></PageSurface>;
}

export function InvoiceDetailPage() {
  const { invoiceId } = useParams();
  const { data, loading, error, reload } = useResource(`/invoices/${invoiceId}`);
  if (loading) return <PageSurface><LoadingState /></PageSurface>;
  if (error) return <PageSurface><ErrorState error={error} onRetry={reload} /></PageSurface>;
  return <PageSurface><PageHeader eyebrow="INVOICE DETAIL" title={data.invoiceNumber} description={`${data.customerId?.name ?? "Customer"} · ${formatDate(data.invoiceDate)}`} actions={<StatusBadge value={data.status} />} /><div className="detail-grid"><TableCard title="Invoiced items" subtitle="Price snapshots from shipment"><DataTable rows={data.items} columns={[{ key: "productName", label: "Product" }, { key: "quantity", label: "Quantity" }, { key: "unitPrice", label: "Unit price", numeric: true, render: (row) => formatMoney(row.unitPrice) }, { key: "totalPrice", label: "Amount", numeric: true, render: (row) => formatMoney(row.totalPrice) }]} /></TableCard><div className="surface detail-summary"><span>Order</span><Link className="table-action" to={`/orders/${data.orderId?._id}`}>{data.orderId?.orderNumber}</Link><span>Subtotal</span><strong>{formatMoney(data.subtotal)}</strong><span>Credits</span><strong>{formatMoney(data.creditNoteAmount)}</strong><span>Paid</span><strong>{formatMoney(data.paidAmount)}</strong><span>Outstanding</span><strong className="text-primary">{formatMoney(data.outstandingAmount)}</strong><span>Shipment</span><Link className="table-action" to={`/shipments/${data.shipmentId?._id}`}>{data.shipmentId?.shipmentNumber}</Link></div></div></PageSurface>;
}

export function PaymentsPage() {
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error, reload } = useResource("/payments", refresh);
  const { data: customersData } = useResource("/customers?limit=100");
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Bank Transfer");
  const [allocations, setAllocations] = useState({});
  const invoices = useResource(`/invoices?customerId=${customerId}`, refresh);
  const { saving, run } = useMutation();
  const outstandingInvoices = itemsOf(invoices.data).filter((invoice) => invoice.outstandingAmount > 0);
  const selectedTotal = Object.values(allocations).reduce((sum, value) => sum + (Number(value) > 0 ? Math.round(Number(value) * 100) : 0), 0);
  const submit = async (event) => {
    event.preventDefault();
    const selected = Object.entries(allocations).filter(([, value]) => Number(value) > 0).map(([invoiceId, value]) => ({ invoiceId, amount: Math.round(Number(value) * 100) }));
    const result = await run(() => api.post("/payments", { paymentNumber: numberId("PAY"), customerId, paymentDate: new Date().toISOString(), amount: Math.round(Number(amount) * 100), paymentMethod: method, referenceNumber: "" , invoiceAllocations: selected }), "Payment recorded and allocated.");
    if (result) { setOpen(false); setAmount(""); setAllocations({}); setRefresh((value) => value + 1); }
  };
  return <PageSurface><PageHeader eyebrow="CASH APPLICATION" title="Payments" description="Record customer receipts and allocate them across open invoices." actions={<button className="button button-primary" onClick={() => setOpen(!open)}><Plus size={16} /> Record payment</button>} />
    {open && <form className="surface form-panel" onSubmit={submit}><div className="form-grid"><FormField label="Customer"><select required value={customerId} onChange={(event) => { setCustomerId(event.target.value); setAllocations({}); }}><option value="">Select customer</option>{selectOptions(itemsOf(customersData), customerLabel)}</select></FormField><FormField label="Payment amount (₹)"><input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></FormField><FormField label="Payment method"><select value={method} onChange={(event) => setMethod(event.target.value)}>{["Bank Transfer", "Cash", "Cheque", "Card", "Other"].map((item) => <option key={item}>{item}</option>)}</select></FormField></div>
      {customerId && <div className="allocation-list"><strong>Allocate to outstanding invoices</strong>{outstandingInvoices.length ? outstandingInvoices.map((invoice) => <div className="allocation-row" key={invoice._id}><div><strong>{invoice.invoiceNumber}</strong><small>{formatDate(invoice.invoiceDate)} · outstanding {formatMoney(invoice.outstandingAmount)}</small></div><input type="number" min="0" max={invoice.outstandingAmount / 100} step="0.01" placeholder="₹ amount" value={allocations[invoice._id] ?? ""} onChange={(event) => setAllocations((current) => ({ ...current, [invoice._id]: event.target.value }))} /></div>) : <EmptyState title="No open invoices" />}</div>}
      <div className="allocation-total">Allocated <strong>{formatMoney(selectedTotal)}</strong> {amount && `of ${formatMoney(Math.round(Number(amount) * 100))}`}</div>
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="button button-primary" disabled={saving || !customerId || selectedTotal !== Math.round(Number(amount) * 100)}>{saving ? "Saving..." : "Save payment"}</button></div>
    </form>}
    <TableCard title="Payment register" subtitle={`${data?.total ?? 0} receipts`}><DataTable rows={itemsOf(data)} loading={loading} error={error} onRetry={reload} columns={[
      { key: "paymentNumber", label: "Payment" }, { key: "customerId", label: "Customer", render: (row) => row.customerId?.name ?? "—" }, { key: "paymentDate", label: "Date", render: (row) => formatDate(row.paymentDate) },
      { key: "paymentMethod", label: "Method" }, { key: "invoiceAllocations", label: "Invoices", render: (row) => row.invoiceAllocations?.length ?? 0 }, { key: "amount", label: "Amount", numeric: true, render: (row) => formatMoney(row.amount) },
    ]} /></TableCard>
  </PageSurface>;
}

export function ReturnsPage() {
  const [refresh, setRefresh] = useState(0);
  const invoices = useResource("/invoices?limit=100", refresh);
  const [invoiceId, setInvoiceId] = useState("");
  const [reason, setReason] = useState("Damaged");
  const [quantities, setQuantities] = useState({});
  const selectedInvoice = itemsOf(invoices.data).find((invoice) => invoice._id === invoiceId);
  const notes = useResource("/credit-notes?limit=100", refresh);
  const { saving, run } = useMutation();
  const createReturn = async (event) => {
    event.preventDefault();
    const returnedItems = Object.entries(quantities).filter(([, quantity]) => Number(quantity) > 0).map(([productId, quantity]) => ({ productId, quantity: Number(quantity) }));
    const result = await run(() => api.post("/credit-notes", { creditNoteNumber: numberId("CN"), customerId: selectedInvoice.customerId._id ?? selectedInvoice.customerId, invoiceId, orderId: selectedInvoice.orderId._id ?? selectedInvoice.orderId, returnedItems, reason }), "Return saved as a pending credit note.");
    if (result) { setRefresh((v) => v + 1); setQuantities({}); setInvoiceId(""); }
  };
  return <PageSurface><PageHeader eyebrow="RETURNS" title="Returns & credit notes" description="Damaged and near-expiry returns are validated against the original invoice. Pending returns do not change balances." />
    <form className="surface form-panel" onSubmit={createReturn}><h2>Register a return</h2><div className="form-grid"><FormField label="Original invoice"><select required value={invoiceId} onChange={(event) => { setInvoiceId(event.target.value); setQuantities({}); }}><option value="">Select invoice</option>{itemsOf(invoices.data).map((invoice) => <option key={invoice._id} value={invoice._id}>{invoice.invoiceNumber} · {invoice.customerId?.name ?? "Customer"} · {formatMoney(invoice.subtotal)}</option>)}</select></FormField><FormField label="Reason"><select value={reason} onChange={(event) => setReason(event.target.value)}><option>Damaged</option><option>Near Expiry</option></select></FormField></div>
      {selectedInvoice && <div className="price-line-list">{selectedInvoice.items.map((item) => <div className="price-line" key={item.productId}><div><strong>{item.productName}</strong><small>Invoiced {item.quantity} · {formatMoney(item.unitPrice)} each</small></div><input aria-label={`Return ${item.productName} quantity`} type="number" min="0" max={item.quantity} value={quantities[item.productId] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.productId]: event.target.value }))} placeholder="Return qty" /></div>)}</div>}
      <div className="form-actions"><button className="button button-primary" disabled={saving || !selectedInvoice || !Object.values(quantities).some((q) => Number(q) > 0)}>{saving ? "Saving..." : "Submit for approval"}</button></div>
    </form>
    <TableCard title="Credit note register" subtitle="Only approved credit notes affect customer balances"><DataTable rows={itemsOf(notes.data)} loading={notes.loading} error={notes.error} onRetry={notes.reload} columns={[
      { key: "creditNoteNumber", label: "Credit note" }, { key: "customerId", label: "Customer", render: (row) => row.customerId?.name ?? "—" }, { key: "invoiceId", label: "Invoice", render: (row) => row.invoiceId?.invoiceNumber ?? "—" },
      { key: "reason", label: "Reason" }, { key: "amount", label: "Amount", numeric: true, render: (row) => formatMoney(row.amount) }, { key: "status", label: "Status", status: true },
    ]} /></TableCard>
  </PageSurface>;
}

export function CreditNotesPage() {
  const [status, setStatus] = useState("");
  const [refresh, setRefresh] = useState(0);
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const { data, loading, error, reload } = useResource(`/credit-notes${query}`, refresh);
  const notify = useNotify();
  const decide = async (creditNote, nextStatus) => {
    try { await api.patch(`/credit-notes/${creditNote._id}/status`, { status: nextStatus }); notify(`Credit note ${nextStatus.toLowerCase()}.`); setRefresh((v) => v + 1); }
    catch (e) { notify(getErrorMessage(e), "error"); }
  };
  return <PageSurface><PageHeader eyebrow="ADJUSTMENTS" title="Credit notes" description="Review return claims. Approval creates the ledger credit and reduces the invoice balance." actions={<Link className="button button-primary" to="/returns"><Plus size={16} /> Register return</Link>} /><div className="toolbar"><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["Pending", "Approved", "Rejected"].map((item) => <option key={item}>{item}</option>)}</select></div><TableCard title="Credit note review" subtitle={`${data?.total ?? 0} credit notes`}><DataTable rows={itemsOf(data)} loading={loading} error={error} onRetry={reload} columns={[
    { key: "creditNoteNumber", label: "Credit note" }, { key: "customerId", label: "Customer", render: (row) => row.customerId?.name ?? "—" }, { key: "invoiceId", label: "Invoice", render: (row) => row.invoiceId?.invoiceNumber ?? "—" },
    { key: "reason", label: "Reason" }, { key: "createdAt", label: "Created", render: (row) => formatDate(row.createdAt) }, { key: "amount", label: "Credit", numeric: true, render: (row) => formatMoney(row.amount) },
    { key: "status", label: "Status", status: true }, { key: "actions", label: "Actions", render: (row) => row.status === "Pending" ? <span className="row-actions"><button className="button button-small button-primary" onClick={() => decide(row, "Approved")}>Approve</button><button className="button button-small button-secondary" onClick={() => decide(row, "Rejected")}>Reject</button></span> : "—" },
  ]} /></TableCard></PageSurface>;
}

export function CustomerLedgerPage() {
  const { customerId } = useParams();
  const [type, setType] = useState("");
  const customer = useResource(`/customers/${customerId}`);
  const credit = useResource(`/customers/${customerId}/credit`);
  const query = type ? `?type=${encodeURIComponent(type)}` : "";
  const ledger = useResource(`/customers/${customerId}/ledger${query}`);
  return <PageSurface><PageHeader eyebrow="CUSTOMER ACCOUNT" title={customer.data?.name ?? "Customer ledger"} description="Chronological financial transactions with running balances." actions={<Link className="button button-secondary" to="/customers">All customers</Link>} />
    {credit.loading ? <LoadingState /> : credit.error ? <ErrorState error={credit.error} /> : <div className="stats-grid compact-stats"><StatCard label="Credit limit" value={formatMoney(credit.data.creditLimit)} note="Approved account limit" icon={ShieldCheck} tone="blue" /><StatCard label="Invoice outstanding" value={formatMoney(credit.data.invoiceOutstanding)} note="Unpaid invoices" icon={FileText} tone="amber" /><StatCard label="Open order value" value={formatMoney(credit.data.openOrderValue)} note="Remaining accepted orders" icon={Boxes} tone="violet" /><StatCard label="Available credit" value={formatMoney(credit.data.availableCredit)} note="Limit less current exposure" icon={CircleDollarSign} tone="green" /></div>}
    <div className="toolbar"><select value={type} onChange={(event) => setType(event.target.value)}><option value="">All transactions</option>{["Invoice", "Payment", "Credit Note"].map((item) => <option key={item}>{item}</option>)}</select></div>
    <TableCard title="Ledger transactions" subtitle={customer.loading ? "Loading account..." : `Account ${customer.data?.customerCode ?? ""}`}><DataTable rows={itemsOf(ledger.data)} loading={ledger.loading} error={ledger.error} onRetry={ledger.reload} emptyTitle="No financial transactions yet" columns={[
      { key: "transactionDate", label: "Date", render: (row) => formatDate(row.transactionDate) }, { key: "transactionType", label: "Type" }, { key: "transactionNumber", label: "Reference" }, { key: "description", label: "Description" },
      { key: "debit", label: "Debit", numeric: true, render: (row) => row.debit ? formatMoney(row.debit) : "—" }, { key: "credit", label: "Credit", numeric: true, render: (row) => row.credit ? formatMoney(row.credit) : "—" },
      { key: "runningBalance", label: "Balance", numeric: true, render: (row) => formatMoney(row.runningBalance) },
    ]} /></TableCard>
  </PageSurface>;
}

export function ReportsPage() {
  const [customerId, setCustomerId] = useState("");
  const customers = useResource("/customers?limit=100");
  const [refresh, setRefresh] = useState(0);
  const query = new URLSearchParams({ ...(customerId ? { customerId } : {}) });
  const report = useResource(`/reports/summary?${query}`, refresh);
  const refreshReport = () => setRefresh((v) => v + 1);
  return <PageSurface><PageHeader eyebrow="ANALYTICS" title="Reports" description="Invoice, payment, sales and approved return summaries computed from database records." /><div className="toolbar"><select value={customerId} onChange={(event) => { setCustomerId(event.target.value); refreshReport(); }}><option value="">All customers</option>{selectOptions(itemsOf(customers.data), customerLabel)}</select><button className="button button-secondary" onClick={refreshReport}><RefreshCw size={15} /> Refresh</button></div>{report.loading ? <LoadingState /> : report.error ? <ErrorState error={report.error} onRetry={report.reload} /> : <div className="stats-grid"><StatCard label="Invoices" value={report.data.invoices.count} note={formatMoney(report.data.invoices.total)} icon={FileText} tone="blue" /><StatCard label="Outstanding" value={formatMoney(report.data.invoices.outstanding)} note="Remaining invoice balance" icon={CircleDollarSign} tone="amber" /><StatCard label="Payments" value={report.data.payments.count} note={formatMoney(report.data.payments.total)} icon={CreditCard} tone="green" /><StatCard label="Orders" value={report.data.sales.orderCount} note={`${formatMoney(report.data.sales.accepted)} accepted order value`} icon={ClipboardList} tone="violet" /><StatCard label="Approved returns" value={formatMoney(report.data.returns.approved)} note={`${formatMoney(report.data.returns.pending)} pending`} icon={RotateCcw} tone="rose" /></div>}</PageSurface>;
}
