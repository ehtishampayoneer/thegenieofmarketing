"use client";

// Marketing Genie logo — an MG monogram with a genie wisp, in ink.
// Clean, geometric, professional. Works as mark-only or with wordmark.

export function Logo({ size = 32, withText = false, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {withText && (
        <span className="font-bold tracking-tight text-ink" style={{ fontSize: size * 0.52 }}>
          Marketing <span className="font-extrabold">Genie</span>
        </span>
      )}
    </span>
  );
}

export function LogoMark({ size = 32, tone = "#11202E" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Marketing Genie">
      <rect width="48" height="48" rx="11" fill={tone} />
      {/* M + G negative-space monogram with a genie wisp curl */}
      <path
        d="M11 34V15h3.4l5.1 8.6 5.1-8.6H33v19h-3.5V21.4l-4.7 7.8h-1.9l-4.7-7.8V34H11z"
        fill="#F8F8F6"
        opacity="0.96"
      />
      {/* Genie wisp — a small rising curl accent */}
      <path
        d="M35 30c2.6 0 4.5-1.8 4.5-4.3 0-2.2-1.5-3.7-3.6-3.7-1.7 0-3 1-3 2.5"
        stroke="#1E9E6A"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="36.2" cy="18.6" r="1.5" fill="#1E9E6A" />
    </svg>
  );
}
