import type { AdminNavigationIconId } from "@/lib/adminNavigation";

export function AdminNavigationIcon({
  name,
  className = "h-5 w-5",
}: {
  name: AdminNavigationIconId;
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "countries") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 9h17M3.5 15h17M12 3c2.3 2.4 3.5 5.4 3.5 9S14.3 18.6 12 21M12 3C9.7 5.4 8.5 8.4 8.5 12s1.2 6.6 3.5 9" />
      </svg>
    );
  }
  if (name === "roster") {
    return (
      <svg {...common}>
        <path d="M12 3 5 6v5c0 4.7 2.7 8 7 10 4.3-2 7-5.3 7-10V6l-7-3Z" />
        <path d="M9 12h6M12 9v6" />
      </svg>
    );
  }
  if (name === "players") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="10" r="2.5" />
        <path d="M3.5 20c.5-4.1 2.3-6 5.5-6s5 1.9 5.5 6M14 15c3.7-.4 5.7 1.2 6.5 4.5" />
      </svg>
    );
  }
  if (name === "rules") {
    return (
      <svg {...common}>
        <path d="M4 6h7M15 6h5M4 12h3M11 12h9M4 18h9M17 18h3" />
        <circle cx="13" cy="6" r="2" />
        <circle cx="9" cy="12" r="2" />
        <circle cx="15" cy="18" r="2" />
      </svg>
    );
  }
  if (name === "actions") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="m15 9 5-5M16 4h4v4" />
      </svg>
    );
  }
  if (name === "requests") {
    return (
      <svg {...common}>
        <path d="M4 4h16v16H4zM4 15h5l1.5 2h3L15 15h5" />
        <path d="M8 8h8M8 11h5" />
      </svg>
    );
  }
  if (name === "ai") {
    return (
      <svg {...common}>
        <rect x="4" y="7" width="16" height="12" rx="3" />
        <path d="M12 3v4M9 13h.01M15 13h.01M8 17h8" />
      </svg>
    );
  }
  if (name === "relations") {
    return (
      <svg {...common}>
        <path d="M4 8h14M15 5l3 3-3 3M20 16H6M9 13l-3 3 3 3" />
      </svg>
    );
  }
  if (name === "discord") {
    return (
      <svg {...common}>
        <path d="M5 16a9 9 0 0 1 0-8M19 8a9 9 0 0 1 0 8M8 13a5 5 0 0 1 0-2M16 11a5 5 0 0 1 0 2" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    );
  }
  if (name === "perks") {
    return (
      <svg {...common}>
        <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
      </svg>
    );
  }
  if (name === "wiki") {
    return (
      <svg {...common}>
        <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}
