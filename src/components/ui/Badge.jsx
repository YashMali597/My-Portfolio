const STATUS_CLASS = {
  active: "badge-status--active",
  idle: "badge-status--idle",
  warning: "badge-status--warning",
};

export default function Badge({ status = "idle", children, className = "" }) {
  const statusClass = STATUS_CLASS[status] ?? STATUS_CLASS.idle;
  return (
    <span className={`badge-status ${statusClass} ${className}`.trim()}>
      {children}
    </span>
  );
}
