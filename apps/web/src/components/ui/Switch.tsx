"use client";

export type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
};

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: SwitchProps) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative h-5 w-10 shrink-0 rounded-full",
        checked ? "bg-signal" : "bg-surface-2",
        "transition-all duration-[var(--duration-normal)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "absolute top-0.5 left-0.5 block h-4 w-4 rounded-full bg-white",
          "transition-all duration-[var(--duration-normal)]",
          checked ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );

  if (!label) return control;

  return (
    <label
      className={[
        "inline-flex items-center gap-2",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      {control}
      <span className="text-sm text-text">{label}</span>
    </label>
  );
}
