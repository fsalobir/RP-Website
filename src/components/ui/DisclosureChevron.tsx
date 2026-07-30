type DisclosureChevronProps = {
  open: boolean;
  direction?: "down" | "right";
  className?: string;
};

export function DisclosureChevron({
  open,
  direction = "down",
  className = "",
}: DisclosureChevronProps) {
  const rotation = direction === "right" ? (open ? 90 : 0) : open ? 180 : 0;

  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform duration-200 ease-out ${className}`}
      style={{ transform: `rotate(${rotation}deg)` }}
      aria-hidden
      focusable="false"
    >
      <path d={direction === "right" ? "m9 6 6 6-6 6" : "m6 9 6 6 6-6"} />
    </svg>
  );
}
