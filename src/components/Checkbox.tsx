import { IconCheck } from "./icons";

interface Props {
  checked: boolean;
  onChange: () => void;
  label?: string;
}

export function Checkbox({ checked, onChange, label }: Props) {
  return (
    <button
      className={`check${checked ? " check--on" : ""}`}
      onClick={onChange}
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? "toggle"}
    >
      {checked && <IconCheck />}
    </button>
  );
}
