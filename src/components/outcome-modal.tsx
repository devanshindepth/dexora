"use client";

import { useState } from "react";
import { X, CheckCircle } from "lucide-react";

export type Outcome = "converted" | "lost" | "escalated" | "resolved";

interface OutcomeModalProps {
  onClose: () => void;
  onSubmit: (outcome: Outcome, notes?: string) => void;
}

const OUTCOMES: {
  value: Outcome;
  label: string;
  emoji: string;
  description: string;
  color: string;
  border: string;
  bg: string;
}[] = [
  {
    value: "converted",
    label: "Converted",
    emoji: "🎯",
    description: "Deal closed or moved to next stage",
    color: "#89d185",
    border: "rgba(137, 209, 133, 0.4)",
    bg: "rgba(137, 209, 133, 0.08)",
  },
  {
    value: "resolved",
    label: "Resolved",
    emoji: "✅",
    description: "Support issue resolved satisfactorily",
    color: "#60a5fa",
    border: "rgba(96, 165, 250, 0.4)",
    bg: "rgba(96, 165, 250, 0.08)",
  },
  {
    value: "escalated",
    label: "Escalated",
    emoji: "⬆️",
    description: "Needs manager or specialist follow-up",
    color: "#cca700",
    border: "rgba(204, 167, 0, 0.4)",
    bg: "rgba(204, 167, 0, 0.08)",
  },
  {
    value: "lost",
    label: "Lost",
    emoji: "❌",
    description: "No progress, prospect not interested",
    color: "#f14c4c",
    border: "rgba(241, 76, 76, 0.4)",
    bg: "rgba(241, 76, 76, 0.08)",
  },
];

export function OutcomeModal({ onClose, onSubmit }: OutcomeModalProps) {
  const [selected, setSelected] = useState<Outcome | null>(null);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 200));
    onSubmit(selected, notes.trim() || undefined);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
        backdropFilter: "blur(4px)",
        animation: "fadeInBackdrop 0.2s ease",
      }}
    >
      <div
        style={{
          background: "var(--panel-bg)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          width: "420px",
          maxWidth: "calc(100vw - 32px)",
          padding: "24px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          animation: "slideUpModal 0.25s ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--foreground)",
              }}
            >
              Session Complete
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "11px",
                color: "var(--foreground-muted)",
                fontFamily: "var(--font-mono)",
              }}
            >
              How did this call go? Cognee will learn from this outcome.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--foreground-muted)",
              padding: "4px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Outcome Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
            marginBottom: "16px",
          }}
        >
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              onClick={() => setSelected(o.value)}
              style={{
                background: selected === o.value ? o.bg : "var(--surface-bg)",
                border: `1px solid ${selected === o.value ? o.border : "var(--border-color)"}`,
                borderRadius: "6px",
                padding: "12px",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
                boxShadow: selected === o.value ? `0 0 0 1px ${o.border}` : "none",
              }}
            >
              <div style={{ fontSize: "18px", marginBottom: "4px" }}>{o.emoji}</div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: selected === o.value ? o.color : "var(--foreground)",
                  marginBottom: "2px",
                }}
              >
                {o.label}
              </div>
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--foreground-muted)",
                  lineHeight: "1.4",
                }}
              >
                {o.description}
              </div>
            </button>
          ))}
        </div>

        {/* Notes */}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional: add notes for Cognee to learn from (key objections, what worked, context)..."
          rows={3}
          style={{
            width: "100%",
            background: "var(--surface-bg)",
            border: "1px solid var(--border-color)",
            borderRadius: "4px",
            color: "var(--foreground)",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            padding: "8px 10px",
            resize: "none",
            outline: "none",
            boxSizing: "border-box",
            marginBottom: "16px",
            lineHeight: "1.5",
          }}
        />

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!selected || isSubmitting}
          style={{
            width: "100%",
            padding: "10px",
            background: selected ? "var(--accent)" : "var(--surface-bg)",
            border: `1px solid ${selected ? "var(--accent)" : "var(--border-color)"}`,
            borderRadius: "4px",
            color: selected ? "white" : "var(--foreground-muted)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: selected && !isSubmitting ? "pointer" : "not-allowed",
            transition: "all 0.15s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
          }}
        >
          {isSubmitting ? (
            "Saving..."
          ) : (
            <>
              <CheckCircle size={14} />
              Save & Train Cognee
            </>
          )}
        </button>
      </div>

      <style>{`
        @keyframes fadeInBackdrop {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUpModal {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
