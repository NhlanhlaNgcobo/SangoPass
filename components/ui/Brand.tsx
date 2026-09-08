export default function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? "brand-light" : ""}`}>
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect width="40" height="40" rx="12" fill="currentColor" />
        <path
          d="M12 28V17a8 8 0 0 1 16 0v11M18 28V17a2 2 0 0 1 4 0v11"
          stroke={light ? "#143E35" : "#D5ED9F"}
          strokeWidth="3.5"
        />
        <path
          d="m25 23 3 3 5-6"
          stroke={light ? "#143E35" : "#D5ED9F"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>
        Sango<span className="font-normal">Pass</span>
        <span className="brand-dot">.</span>
      </span>
    </span>
  );
}
