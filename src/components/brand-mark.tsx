export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="7" fill="var(--ink)" />
      <path d="M16 5 26 10.8 16 16.6 6 10.8Z" fill="var(--lime)" />
      <path d="M6 12.6 16 18.4V27L6 21.2Z" fill="var(--green)" />
      <path d="M26 12.6 16 18.4V27l10-5.8Z" fill="var(--green-dark)" />
    </svg>
  );
}
