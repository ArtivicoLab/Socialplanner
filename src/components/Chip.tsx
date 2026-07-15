interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  dotColor?: string;
  // Lights up the chip (a ring in dotColor) when this category has something
  // due today or overdue — independent of `active`, which just means "this
  // is the current filter".
  urgent?: boolean;
}

export function Chip({ active, onClick, children, dotColor, urgent }: ChipProps) {
  return (
    <button
      className={`chip${active ? " chip--on" : ""}${urgent ? " chip--urgent" : ""}`}
      onClick={onClick}
      aria-pressed={active}
      style={urgent ? { boxShadow: `0 0 0 1.5px ${dotColor ?? "var(--accent)"}` } : undefined}
    >
      {dotColor && (
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: dotColor,
            flex: "none",
          }}
        />
      )}
      {children}
    </button>
  );
}

interface ChipRowProps {
  children: React.ReactNode;
}
export function ChipRow({ children }: ChipRowProps) {
  return <div className="chip-row">{children}</div>;
}
