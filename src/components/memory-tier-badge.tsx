"use client";

interface MemoryTierBadgeProps {
  globalLoaded: boolean;
  companyLoaded: boolean;
  personLoaded: boolean;
  companyName?: string;
  personName?: string;
}

function Tier({
  label,
  loaded,
  tooltip,
  color,
}: {
  label: string;
  loaded: boolean;
  tooltip: string;
  color: string;
}) {
  return (
    <div
      title={tooltip}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "3px 7px",
        borderRadius: "4px",
        border: `1px solid ${loaded ? color + "55" : "var(--border-color)"}`,
        background: loaded ? color + "15" : "transparent",
        cursor: "default",
        transition: "all 0.3s ease",
      }}
    >
      <span
        style={{
          width: "5px",
          height: "5px",
          borderRadius: "50%",
          background: loaded ? color : "var(--border-color)",
          flexShrink: 0,
          transition: "background 0.3s ease",
          boxShadow: loaded ? `0 0 4px ${color}` : "none",
        }}
      />
      <span
        style={{
          fontSize: "9px",
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          color: loaded ? color : "var(--foreground-muted)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </div>
  );
}

export function MemoryTierBadge({
  globalLoaded,
  companyLoaded,
  personLoaded,
  companyName,
  personName,
}: MemoryTierBadgeProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontSize: "9px",
          fontFamily: "var(--font-mono)",
          color: "var(--foreground-muted)",
          marginRight: "2px",
        }}
      >
        MEMORY:
      </span>
      <Tier
        label="Global"
        loaded={globalLoaded}
        tooltip="Global product & objection knowledge"
        color="#60a5fa"
      />
      <Tier
        label="Company"
        loaded={companyLoaded}
        tooltip={companyName ? `Company memory: ${companyName}` : "No company context"}
        color="#2dd4bf"
      />
      <Tier
        label="Person"
        loaded={personLoaded}
        tooltip={personName ? `Person memory: ${personName}` : "No person context"}
        color="#a78bfa"
      />
    </div>
  );
}
