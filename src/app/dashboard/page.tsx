import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dexora — Intelligence Dashboard",
  description: "Session history, knowledge graph, and AI learning insights for your sales co-pilot",
};

export const revalidate = 0; // always fetch fresh

interface SessionSummary {
  sessionId: string;
  companyName: string;
  personName: string;
  mode: "sales" | "support";
  outcome: string | null;
  savedAt: string;
  turnCount: number;
}

const OUTCOME_STYLE: Record<string, { color: string; bg: string; emoji: string }> = {
  converted: { color: "#89d185", bg: "rgba(137, 209, 133, 0.1)", emoji: "🎯" },
  resolved:  { color: "#60a5fa", bg: "rgba(96, 165, 250, 0.1)", emoji: "✅" },
  escalated: { color: "#cca700", bg: "rgba(204, 167, 0, 0.1)", emoji: "⬆️" },
  lost:      { color: "#f14c4c", bg: "rgba(241, 76, 76, 0.1)", emoji: "❌" },
};

async function getSessions(): Promise<SessionSummary[]> {
  try {
    const res = await fetch("http://localhost:3000/api/sessions", {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  const cfg = outcome ? OUTCOME_STYLE[outcome] : null;
  if (!cfg) {
    return (
      <span
        style={{
          fontSize: "9px",
          fontFamily: "monospace",
          color: "#555",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid #333",
          borderRadius: "3px",
          padding: "2px 6px",
          textTransform: "uppercase",
        }}
      >
        no outcome
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: "9px",
        fontFamily: "monospace",
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.color}55`,
        borderRadius: "3px",
        padding: "2px 6px",
        textTransform: "uppercase",
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        gap: "3px",
      }}
    >
      {cfg.emoji} {outcome}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div
      style={{
        background: "var(--panel-bg)",
        border: "1px solid var(--border-color)",
        borderRadius: "6px",
        padding: "16px 20px",
        minWidth: "120px",
      }}
    >
      <div
        style={{
          fontSize: "24px",
          fontWeight: 700,
          color: "var(--foreground)",
          lineHeight: 1,
          marginBottom: "6px",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "10px",
          fontFamily: "monospace",
          color: "var(--foreground-muted)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: "10px", color: "var(--success)", marginTop: "4px" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const sessions = await getSessions();

  const converted = sessions.filter((s) => s.outcome === "converted").length;
  const resolved  = sessions.filter((s) => s.outcome === "resolved").length;
  const lost      = sessions.filter((s) => s.outcome === "lost").length;
  const winRate   = sessions.length > 0
    ? Math.round(((converted + resolved) / sessions.length) * 100)
    : 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--background)",
        color: "var(--foreground)",
        fontFamily: "var(--font-sans), Arial, sans-serif",
        padding: "0",
      }}
    >
      {/* Top Nav */}
      <nav
        style={{
          height: "44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          borderBottom: "1px solid var(--border-color)",
          background: "var(--surface-bg)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--foreground)" }}>
            🧠 Dexora
          </span>
          <span
            style={{
              fontSize: "10px",
              fontFamily: "monospace",
              color: "var(--foreground-muted)",
              background: "var(--border-color)",
              padding: "2px 8px",
              borderRadius: "10px",
            }}
          >
            Intelligence Dashboard
          </span>
        </div>
        <Link
          href="/"
          style={{
            fontSize: "11px",
            fontFamily: "monospace",
            color: "var(--foreground-muted)",
            textDecoration: "none",
            padding: "4px 12px",
            border: "1px solid var(--border-color)",
            borderRadius: "4px",
            transition: "all 0.15s",
          }}
        >
          ← Back to Co-pilot
        </Link>
      </nav>

      <div style={{ padding: "24px", maxWidth: "1100px", margin: "0 auto" }}>
        {/* Stats row */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "28px",
            flexWrap: "wrap",
          }}
        >
          <StatCard label="Total Sessions" value={sessions.length} />
          <StatCard label="Win Rate" value={`${winRate}%`} sub={sessions.length > 0 ? `${converted + resolved} won` : undefined} />
          <StatCard label="Converted" value={converted} />
          <StatCard label="Resolved" value={resolved} />
          <StatCard label="Lost" value={lost} />
          <StatCard
            label="Memory Tiers"
            value="3"
            sub="Global · Company · Person"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "20px", alignItems: "start" }}>
          {/* Sessions Table */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
              }}
            >
              <h2
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--foreground-muted)",
                  fontFamily: "monospace",
                  margin: 0,
                }}
              >
                Session History
              </h2>
              <span
                style={{
                  fontSize: "10px",
                  fontFamily: "monospace",
                  color: "var(--foreground-muted)",
                }}
              >
                {sessions.length} sessions
              </span>
            </div>

            {sessions.length === 0 ? (
              <div
                style={{
                  background: "var(--panel-bg)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  padding: "40px",
                  textAlign: "center",
                  color: "var(--foreground-muted)",
                  fontSize: "12px",
                  fontFamily: "monospace",
                }}
              >
                No sessions yet. Start a call from the co-pilot to see history here.
              </div>
            ) : (
              <div
                style={{
                  background: "var(--panel-bg)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  overflow: "hidden",
                }}
              >
                {/* Table header */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 80px 90px 60px",
                    padding: "8px 16px",
                    borderBottom: "1px solid var(--border-color)",
                    background: "var(--surface-bg)",
                  }}
                >
                  {["Contact", "Company", "Mode", "Outcome", "Turns"].map((h) => (
                    <span
                      key={h}
                      style={{
                        fontSize: "9px",
                        fontFamily: "monospace",
                        color: "var(--foreground-muted)",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        fontWeight: 700,
                      }}
                    >
                      {h}
                    </span>
                  ))}
                </div>

                {sessions.map((s, i) => (
                  <div
                    key={s.sessionId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 80px 90px 60px",
                      padding: "10px 16px",
                      borderBottom:
                        i < sessions.length - 1
                          ? "1px solid var(--border-color)"
                          : "none",
                      alignItems: "center",
                      transition: "background 0.1s",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--foreground)", fontWeight: 500 }}>
                        {s.personName || "—"}
                      </div>
                      <div style={{ fontSize: "9px", color: "var(--foreground-muted)", fontFamily: "monospace", marginTop: "2px" }}>
                        {new Date(s.savedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--foreground-muted)" }}>
                      {s.companyName || "—"}
                    </div>
                    <div>
                      <span
                        style={{
                          fontSize: "9px",
                          fontFamily: "monospace",
                          color: s.mode === "sales" ? "#60a5fa" : "#a78bfa",
                          background: s.mode === "sales"
                            ? "rgba(96, 165, 250, 0.1)"
                            : "rgba(167, 139, 250, 0.1)",
                          border: `1px solid ${s.mode === "sales" ? "rgba(96, 165, 250, 0.3)" : "rgba(167, 139, 250, 0.3)"}`,
                          borderRadius: "3px",
                          padding: "2px 6px",
                          textTransform: "capitalize",
                        }}
                      >
                        {s.mode}
                      </span>
                    </div>
                    <div>
                      <OutcomeBadge outcome={s.outcome} />
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        fontFamily: "monospace",
                        color: "var(--foreground-muted)",
                      }}
                    >
                      {s.turnCount}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Memory Status + How Cognee works */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Cognee Memory Status */}
            <div
              style={{
                background: "var(--panel-bg)",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                padding: "16px",
              }}
            >
              <h3
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--foreground-muted)",
                  fontFamily: "monospace",
                  margin: "0 0 12px",
                }}
              >
                🧠 Cognee Memory
              </h3>

              {[
                {
                  tier: "Global Knowledge",
                  key: "global",
                  color: "#60a5fa",
                  desc: "Product facts, objection rebuttals, competitor intel. Seeded at startup.",
                  icon: "🌐",
                },
                {
                  tier: "Company Memory",
                  key: "company",
                  color: "#2dd4bf",
                  desc: `Account history per org. ${sessions.length > 0 ? `${new Set(sessions.map((s) => s.companyName).filter(Boolean)).size} companies tracked.` : "No companies yet."}`,
                  icon: "🏢",
                },
                {
                  tier: "Person Memory",
                  key: "person",
                  color: "#a78bfa",
                  desc: `Individual stakeholder intel. ${sessions.length > 0 ? `${new Set(sessions.map((s) => s.personName).filter(Boolean)).size} contacts tracked.` : "No contacts yet."}`,
                  icon: "👤",
                },
              ].map((t) => (
                <div
                  key={t.key}
                  style={{
                    padding: "10px",
                    borderRadius: "5px",
                    background: `${t.color}10`,
                    border: `1px solid ${t.color}30`,
                    marginBottom: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "12px" }}>{t.icon}</span>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        color: t.color,
                        fontFamily: "monospace",
                      }}
                    >
                      {t.tier}
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: t.color,
                        boxShadow: `0 0 4px ${t.color}`,
                      }}
                    />
                  </div>
                  <p style={{ fontSize: "10px", color: "var(--foreground-muted)", margin: 0, lineHeight: "1.5" }}>
                    {t.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* How it improves */}
            <div
              style={{
                background: "var(--panel-bg)",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                padding: "16px",
              }}
            >
              <h3
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--foreground-muted)",
                  fontFamily: "monospace",
                  margin: "0 0 12px",
                }}
              >
                ♻️ How It Gets Smarter
              </h3>
              {[
                { step: "1", text: "Customer speaks → Cognee searches all 3 memory tiers" },
                { step: "2", text: "LLM generates suggestion cards using recalled context" },
                { step: "3", text: "Call ends → transcript ingested into relevant tiers" },
                { step: "4", text: "Outcome label reinforces or downgrades patterns" },
                { step: "5", text: "Next call with same company/person starts smarter" },
              ].map((s) => (
                <div
                  key={s.step}
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "flex-start",
                    marginBottom: "8px",
                  }}
                >
                  <span
                    style={{
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: "var(--accent)",
                      color: "white",
                      fontSize: "9px",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontFamily: "monospace",
                    }}
                  >
                    {s.step}
                  </span>
                  <p style={{ fontSize: "11px", color: "var(--foreground-muted)", margin: 0, lineHeight: "1.5" }}>
                    {s.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
