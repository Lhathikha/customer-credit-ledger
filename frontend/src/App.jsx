import { useState } from "react";
import {
  Activity, BadgeIndianRupee, Boxes, ClipboardList, CreditCard, FileText,
  LayoutDashboard, Menu, RotateCcw, Settings2, ShieldCheck, Truck, Users, X,
} from "lucide-react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useResource } from "./hooks/useResource.js";
import {
  ContractsPage, CreateOrderPage, CreateShipmentPage, CreditNotesPage, CustomerLedgerPage,
  CustomersPage, DashboardPage, InvoiceDetailPage, InvoicesPage, OrderDetailPage, OrdersPage,
  PaymentsPage, ProductsPage, ReportsPage, ReturnsPage, ShipmentDetailPage, ShipmentsPage,
} from "./pages/Pages.jsx";

const navigation = [
  { title: "WORKSPACE", items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/customers", label: "Customers", icon: Users },
    { to: "/products", label: "Products", icon: Boxes },
    { to: "/contracts", label: "Contracts & pricing", icon: BadgeIndianRupee },
  ] },
  { title: "OPERATIONS", items: [
    { to: "/orders", label: "Orders", icon: ClipboardList },
    { to: "/shipments", label: "Shipments", icon: Truck },
    { to: "/invoices", label: "Invoices", icon: FileText },
    { to: "/payments", label: "Payments", icon: CreditCard },
    { to: "/returns", label: "Returns", icon: RotateCcw },
    { to: "/credit-notes", label: "Credit notes", icon: ShieldCheck },
  ] },
  { title: "INSIGHTS", items: [{ to: "/reports", label: "Reports", icon: Activity }] },
];

const titles = [
  ["/orders/new", "Create order"], ["/shipments/new", "Create shipment"],
  ["/customers/", "Customer ledger"], ["/orders/", "Order details"],
  ["/invoices/", "Invoice details"], ["/shipments/", "Shipment details"],
];

function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const health = useResource("/health");
  const currentTitle = titles.find(([prefix]) => prefix.endsWith("/new")
    ? location.pathname === prefix
    : location.pathname.startsWith(prefix))?.[1]
    ?? navigation.flatMap((group) => group.items).find((item) => item.to === location.pathname)?.label
    ?? "Dashboard";
  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark"><span>cl</span></div><div><strong>clearledger</strong><small>HEALTHCARE ERP</small></div><button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="workspace-switch"><div className="workspace-avatar">CL</div><div><strong>Customer credit ledger</strong><small>Operations workspace</small></div></div>
      <nav className="side-nav" aria-label="Main navigation">{navigation.map((group) => <div className="nav-group" key={group.title}><span className="nav-heading">{group.title}</span>{group.items.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? "nav-active" : ""}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></NavLink>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="support-card"><div className="support-badge"><Settings2 size={16} /></div><div><strong>Workspace status</strong><small>Live records from your API</small></div></div></div>
    </aside>
    {mobileOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{currentTitle}</strong></div></div><div className="topbar-right"><span className={`api-status ${health.data?.database === "connected" ? "api-online" : ""}`}><span />{health.loading ? "Checking API" : health.error ? "API unavailable" : health.data?.database === "connected" ? "Database connected" : "Database not configured"}</span></div></header>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:customerId/ledger" element={<CustomerLedgerPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/contracts" element={<ContractsPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/new" element={<CreateOrderPage />} />
        <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        <Route path="/shipments" element={<ShipmentsPage />} />
        <Route path="/shipments/new" element={<CreateShipmentPage />} />
        <Route path="/shipments/:shipmentId" element={<ShipmentDetailPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:invoiceId" element={<InvoiceDetailPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/credit-notes" element={<CreditNotesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  </div>;
}

export default function App() {
  return <Shell />;
}
