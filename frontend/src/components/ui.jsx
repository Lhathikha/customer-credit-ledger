import { AlertCircle, LoaderCircle, Search } from "lucide-react";

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="page-heading">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = "Search..." }) {
  return <label className="search-box"><Search size={16} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

export function LoadingState({ label = "Loading data..." }) {
  return <div className="state-box"><LoaderCircle className="spin" size={22} /><span>{label}</span></div>;
}

export function ErrorState({ error, onRetry }) {
  return <div className="state-box state-error"><AlertCircle size={20} /><span>{error}</span>{onRetry && <button className="button button-secondary button-small" onClick={onRetry}>Retry</button>}</div>;
}

export function EmptyState({ title = "No records found", description = "Try adjusting your filters or add a new record." }) {
  return <div className="empty-state"><div className="empty-icon"><Search size={22} /></div><strong>{title}</strong><span>{description}</span></div>;
}

export function StatusBadge({ value }) {
  const variant = String(value || "").toLowerCase().replaceAll(" ", "-");
  return <span className={`status-badge status-${variant}`}>{value || "—"}</span>;
}

export function FormField({ label, children, hint, className = "" }) {
  return <label className={`form-field ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
