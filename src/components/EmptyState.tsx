interface Props {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  children?: React.ReactNode;
}

export function EmptyState({ icon, title, sub, children }: Props) {
  return (
    <div className="empty">
      <div
        aria-hidden
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          margin: "0 auto 16px",
          display: "grid",
          placeItems: "center",
          background: "var(--surface-2)",
          color: "var(--accent)",
        }}
      >
        {icon}
      </div>
      <div className="empty__title">{title}</div>
      {sub && <div className="empty__sub">{sub}</div>}
      {children && <div style={{ marginTop: 16 }}>{children}</div>}
    </div>
  );
}
