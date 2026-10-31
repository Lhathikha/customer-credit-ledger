import { Link } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "./ui.jsx";

export function DataTable({ columns, rows, loading, error, onRetry, emptyTitle, rowLink }) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!rows?.length) return <EmptyState title={emptyTitle} />;
  return (
    <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column.key} className={column.numeric ? "align-right" : ""}>{column.label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => {
        const content = columns.map((column) => {
          const value = column.render ? column.render(row) : row[column.key];
          return <td key={column.key} className={column.numeric ? "align-right" : ""}>
            {column.status ? <StatusBadge value={value} /> : value ?? "—"}
          </td>;
        });
        return <tr key={row._id || row.id || index}>{rowLink
          ? columns.map((column, columnIndex) => {
            const value = column.render ? column.render(row) : row[column.key];
            return <td key={column.key} className={column.numeric ? "align-right" : ""}>
              <Link to={rowLink(row)} className="table-row-link">{column.status ? <StatusBadge value={value} /> : value ?? "—"}</Link>
              {columnIndex === 0 && <span className="sr-only">Open details</span>}
            </td>;
          })
          : content}</tr>;
      })}</tbody>
    </table></div>
  );
}

export function TableCard({ title, subtitle, action, children }) {
  return <section className="surface table-card"><div className="table-card-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}
