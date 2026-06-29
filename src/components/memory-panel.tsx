"use client";

// ─── Memory Panel ─────────────────────────────────────────────────────────────
// Displays the live Customer Digital Twin — persistent memory built across sessions.
// Shows: semantic facts, predictions, session history, reflections, procedural patterns.

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, TrendingUp, History, Lightbulb, AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import type { CustomerMemory } from "@/lib/memory/types";

interface MemoryPanelProps {
  memory: CustomerMemory | null;
  isUpdating: boolean;
  onReset: () => void;
}

function Section({
  icon,
  title,
  children,
  defaultOpen = true,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string | number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[var(--border-color)] mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[var(--surface-bg)] text-[10px] font-mono font-semibold uppercase tracking-wider text-[var(--foreground-muted)] hover:text-white transition-colors"
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
          {badge !== undefined && (
            <span className="ml-1 bg-[var(--accent)] text-white rounded px-1 py-0.5 text-[9px]">
              {badge}
            </span>
          )}
        </span>
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="p-3 bg-[#1e1e1e] font-mono text-[10px] text-[var(--foreground)]">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Tag({ children, color = "default" }: { children: React.ReactNode; color?: "default" | "green" | "red" | "yellow" | "blue" }) {
  const colors = {
    default: "bg-[#2d2d2d] text-[#aaa]",
    green: "bg-[#1a2e1a] text-[var(--success)] border border-[var(--success)]",
    red: "bg-[#2e1a1a] text-[var(--danger)] border border-[var(--danger)]",
    yellow: "bg-[#2e2a1a] text-[var(--warning)] border border-[var(--warning)]",
    blue: "bg-[#1a2030] text-[#569cd6] border border-[#569cd6]",
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] mr-1 mb-1 ${colors[color]}`}>
      {children}
    </span>
  );
}

function ProbabilityBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between mb-0.5">
        <span className="text-[var(--foreground-muted)]">{label}</span>
        <span className="text-white">{value}%</span>
      </div>
      <div className="h-1.5 bg-[#333] w-full overflow-hidden">
        <motion.div
          className={`h-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.6, type: "spring" }}
        />
      </div>
    </div>
  );
}

export function MemoryPanel({ memory, isUpdating, onReset }: MemoryPanelProps) {
  if (!memory) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--foreground-muted)] text-xs font-mono">
        Loading memory...
      </div>
    );
  }

  const sem = memory.semantic;
  const pred = memory.predictions;
  const totalSessions = memory.episodic.length;
  const latestReflections = memory.reflections.slice(-3).reverse();
  const latestProcedural = memory.procedural.slice(-3).reverse();

  const buyingStageColors: Record<string, string> = {
    unknown: "default",
    awareness: "yellow",
    consideration: "blue",
    decision: "green",
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-dark)] bg-[var(--panel-bg)]">
        <div className="flex items-center gap-2">
          <Brain size={12} className="text-[var(--accent-hover)]" />
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
            Customer Digital Twin
          </span>
          {isUpdating && (
            <span className="text-[9px] text-[var(--warning)] animate-pulse">● UPDATING</span>
          )}
        </div>
        <button
          onClick={onReset}
          title="Reset memory (start fresh)"
          className="text-[var(--foreground-muted)] hover:text-[var(--danger)] transition-colors"
        >
          <RefreshCw size={11} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {/* Customer profile */}
        <Section icon={<Brain size={10} />} title="Customer Profile" defaultOpen={true}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div><span className="text-[var(--foreground-muted)]">Name: </span>{sem.customerProfile.name}</div>
            <div><span className="text-[var(--foreground-muted)]">Role: </span>{sem.customerProfile.role}</div>
            <div><span className="text-[var(--foreground-muted)]">Company: </span>{sem.customerProfile.company}</div>
            <div><span className="text-[var(--foreground-muted)]">Industry: </span>{sem.customerProfile.industry}</div>
            <div><span className="text-[var(--foreground-muted)]">Size: </span>{sem.customerProfile.teamSize}</div>
            <div>
              <span className="text-[var(--foreground-muted)]">Stage: </span>
              <Tag color={buyingStageColors[sem.buyingStage] as any}>{sem.buyingStage}</Tag>
            </div>
          </div>
          {sem.budget !== "unknown" && (
            <div className="mt-1"><span className="text-[var(--foreground-muted)]">Budget: </span>{sem.budget}</div>
          )}
          <div className="mt-1">
            <span className="text-[var(--foreground-muted)]">Sessions: </span>
            <span className="text-white">{totalSessions}</span>
          </div>
        </Section>

        {/* Predictions */}
        <Section icon={<TrendingUp size={10} />} title="Predictive Intelligence" defaultOpen={true}>
          <ProbabilityBar label="Close Probability" value={pred.closeProbability} color="bg-[var(--success)]" />
          <ProbabilityBar label="Churn Risk" value={pred.churnRisk} color="bg-[var(--danger)]" />
          <div className="mt-2 space-y-1">
            <div><span className="text-[var(--foreground-muted)]">Next objection: </span>{pred.nextLikelyObjection}</div>
            <div><span className="text-[var(--foreground-muted)]">Recommended: </span>{pred.recommendedNextAction}</div>
            <div><span className="text-[var(--foreground-muted)]">Timeline: </span>{pred.estimatedDecisionTimeline}</div>
          </div>
        </Section>

        {/* Known facts */}
        {(sem.objections.length > 0 || sem.technicalStack.length > 0 || sem.competitors.length > 0 || sem.unmetNeeds.length > 0) && (
          <Section
            icon={<AlertTriangle size={10} />}
            title="Known Facts"
            defaultOpen={true}
            badge={sem.objections.length + sem.technicalStack.length + sem.competitors.length}
          >
            {sem.technicalStack.length > 0 && (
              <div className="mb-2">
                <div className="text-[var(--foreground-muted)] mb-1">Tech Stack:</div>
                {sem.technicalStack.map((t) => <Tag key={t}>{t}</Tag>)}
              </div>
            )}
            {sem.competitors.length > 0 && (
              <div className="mb-2">
                <div className="text-[var(--foreground-muted)] mb-1">Competitors:</div>
                {sem.competitors.map((c) => <Tag key={c} color="red">{c}</Tag>)}
              </div>
            )}
            {sem.objections.length > 0 && (
              <div className="mb-2">
                <div className="text-[var(--foreground-muted)] mb-1">Objections:</div>
                {sem.objections.map((o) => <Tag key={o} color="yellow">{o}</Tag>)}
              </div>
            )}
            {sem.unmetNeeds.length > 0 && (
              <div className="mb-2">
                <div className="text-[var(--foreground-muted)] mb-1">Unmet Needs:</div>
                {sem.unmetNeeds.map((n) => <Tag key={n} color="blue">{n}</Tag>)}
              </div>
            )}
            {sem.complianceRequirements.length > 0 && (
              <div className="mb-2">
                <div className="text-[var(--foreground-muted)] mb-1">Compliance:</div>
                {sem.complianceRequirements.map((c) => <Tag key={c} color="blue">{c}</Tag>)}
              </div>
            )}
          </Section>
        )}

        {/* Reflections */}
        {latestReflections.length > 0 && (
          <Section
            icon={<Lightbulb size={10} />}
            title="Lessons Learned"
            defaultOpen={true}
            badge={memory.reflections.length}
          >
            {latestReflections.map((r) => (
              <div key={r.id} className="mb-3 border-b border-[#2a2a2a] pb-2 last:border-0 last:pb-0">
                <div className="text-[var(--warning)] mb-0.5">{r.lesson}</div>
                <div className="text-[#aaa]">→ {r.actionableInsight}</div>
                <div className="mt-1">
                  {r.appliesTo.map((t) => <Tag key={t}>{t}</Tag>)}
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* Session history */}
        {memory.episodic.length > 0 && (
          <Section
            icon={<History size={10} />}
            title="Session History"
            defaultOpen={false}
            badge={memory.episodic.length}
          >
            {memory.episodic
              .slice()
              .reverse()
              .slice(0, 5)
              .map((e) => (
                <div key={e.id} className="mb-2 border-b border-[#2a2a2a] pb-2 last:border-0">
                  <div className="flex justify-between">
                    <span className="text-[var(--foreground-muted)]">{new Date(e.timestamp).toLocaleDateString()}</span>
                    <Tag color={e.outcome === "success" ? "green" : e.outcome === "failure" ? "red" : "default"}>
                      {e.outcome}
                    </Tag>
                  </div>
                  <div className="text-[#aaa] mt-0.5">{e.summary}</div>
                  <div className="flex gap-3 mt-0.5 text-[var(--foreground-muted)]">
                    <span>T:{e.trust}/100</span>
                    <span>V:{e.value}/100</span>
                    <span>{e.turnCount} turns</span>
                  </div>
                </div>
              ))}
          </Section>
        )}

        {/* Procedural patterns */}
        {latestProcedural.length > 0 && (
          <Section
            icon={<Brain size={10} />}
            title="Sales Patterns"
            defaultOpen={false}
            badge={memory.procedural.length}
          >
            {latestProcedural.map((p) => (
              <div key={p.id} className="mb-2 border-b border-[#2a2a2a] pb-2 last:border-0">
                <Tag color={p.outcome === "positive" ? "green" : "red"}>{p.outcome}</Tag>
                <div className="text-[#aaa] mt-0.5">{p.pattern}</div>
                <div className="text-[var(--foreground-muted)]">confidence: {Math.round(p.confidence * 100)}%</div>
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}
