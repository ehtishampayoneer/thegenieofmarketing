"use client";

// Marketing Genie logo — uses the real uploaded mark at /public/logo.png.
// Upload your genie logo to the repo as: public/logo.png

export function Logo({ size = 40, withText = true, stacked = false, className = "" }) {
  if (stacked) {
    return (
      <span className={`inline-flex flex-col items-center gap-1.5 ${className}`}>
        <img src="/logo.png" alt="Marketing Genie" width={size} height={size} style={{ objectFit: "contain" }} />
        {withText && <span className="font-bold tracking-tight text-ink text-center leading-tight" style={{ fontSize: size * 0.3 }}>Marketing Genie</span>}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img src="/logo.png" alt="Marketing Genie" width={size} height={size} style={{ objectFit: "contain" }} />
      {withText && <span className="font-bold tracking-tight text-ink" style={{ fontSize: size * 0.4 }}>Marketing Genie</span>}
    </span>
  );
}

export function LogoMark({ size = 32 }) {
  return <img src="/logo.png" alt="Marketing Genie" width={size} height={size} style={{ objectFit: "contain" }} />;
}
