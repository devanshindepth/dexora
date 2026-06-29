"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export type SuggestionType = "objection" | "fact" | "question" | "memory";

export interface SuggestionCardData {
  id: string;
  type: SuggestionType;
  content: string;
  source: string;
  confidence: number;
}

const TYPE_CONFIG: Record<
  SuggestionType,
  { label: string; icon: string; color: string; bg: string; border: string; glow: string }
> = {
  objection: {
    label: "Objection Rebuttal",
    icon: "🛡️",
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.07)",
    border: "rgba(245, 158, 11, 0.25)",
    glow: "rgba(245, 158, 11, 0.15)",
  },
  fact: {
    label: "Product Fact",
    icon: "📋",
    color: "#60a5fa",
    bg: "rgba(96, 165, 250, 0.07)",
    border: "rgba(96, 165, 250, 0.25)",
    glow: "rgba(96, 165, 250, 0.15)",
  },
  question: {
    label: "Smart Question",
    icon: "❓",
    color: "#a78bfa",
    bg: "rgba(167, 139, 250, 0.07)",
    border: "rgba(167, 139, 250, 0.25)",
    glow: "rgba(167, 139, 250, 0.15)",
  },
  memory: {
    label: "From Memory",
    icon: "🧠",
    color: "#2dd4bf",
    bg: "rgba(45, 212, 191, 0.07)",
    border: "rgba(45, 212, 191, 0.25)",
    glow: "rgba(45, 212, 191, 0.15)",
  },
};

function SourceBadge({ source }: { source: string }) {
  let label = source;
  if (source === "global") label = "Global KB";
  else if (source.startsWith("company:")) label = `Company · ${source.replace("company:", "")}`;
  else if (source.startsWith("person:")) label = `Person · ${source.replace("person:", "")}`;
  else if (source === "ai-analysis") label = "AI Analysis";
  else if (source === "past-calls") label = "Past Calls";
  else if (source === "product-knowledge") label = "Product KB";

  return (
    <span
      style={{
        fontSize: "9px",
        fontFamily: "var(--font-mono)",
        color: "var(--foreground-muted)",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--border-color)",
        borderRadius: "3px",
        padding: "1px 5px",
        letterSpacing: "0.03em",
      }}
    >
      {label}
    </span>
  );
}

export function SuggestionCard({
  card,
  isNew = false,
}: {
  card: SuggestionCardData;
  isNew?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const cfg = TYPE_CONFIG[card.type];

  const handleCopy = () => {
    navigator.clipboard.writeText(card.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: "6px",
        padding: "10px 12px",
        marginBottom: "8px",
        position: "relative",
        boxShadow: isNew ? `0 0 12px ${cfg.glow}` : "none",
        animation: isNew ? "slideInCard 0.25s ease-out" : "none",
        transition: "box-shadow 0.3s ease",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "6px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "12px" }}>{cfg.icon}</span>
          <span
            style={{
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              color: cfg.color,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {cfg.label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <SourceBadge source={card.source} />
          {/* Confidence bar */}
          <div
            style={{
              width: "32px",
              height: "3px",
              background: "var(--border-color)",
              borderRadius: "2px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${card.confidence * 100}%`,
                height: "100%",
                background: cfg.color,
                borderRadius: "2px",
              }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <p
        style={{
          fontSize: "12px",
          lineHeight: "1.55",
          color: "var(--foreground)",
          margin: 0,
          paddingRight: "28px",
        }}
      >
        {card.content}
      </p>

      {/* Copy button */}
      <button
        onClick={handleCopy}
        title="Copy suggestion"
        style={{
          position: "absolute",
          bottom: "8px",
          right: "8px",
          width: "22px",
          height: "22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: copied ? cfg.color : "var(--foreground-muted)",
          transition: "color 0.2s",
          padding: 0,
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>

      <style>{`
        @keyframes slideInCard {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
