"use client";

import { useState } from "react";
import { X, Cpu, GitBranch, ShieldCheck, FlaskConical, Plug, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const stack = [
  { name: "Next.js 15", role: "App Router, React Server Components, Route Handlers" },
  { name: "LangGraph.js", role: "Stateful multi-agent orchestration with parallel branches" },
  { name: "Inngest", role: "Durable background jobs, step.waitForEvent for 72h HITL window" },
  { name: "OpenAI", role: "gpt-4o reasoning · gpt-4o-mini classification/eval · text-embedding-3-small" },
  { name: "pgvector", role: "Cosine similarity RAG search over embedded knowledge base" },
  { name: "HuggingFace", role: "Cross-encoder reranker — re-scores RAG candidates before LLM sees them" },
  { name: "Prisma 6", role: "Type-safe ORM with JSON columns, raw vector queries, and org-scoped access" },
  { name: "Better Auth", role: "Self-hosted auth with Organizations — org-scoped data isolation across all models" },
];

const highlights = [
  {
    icon: Cpu,
    title: "Multi-agent pipeline",
    body: "Eight specialized agents run in a LangGraph StateGraph: intake classification → customer context → four parallel analysis agents (logs, RAG knowledge, incident correlation, deployment correlation) → root cause → response drafting → guardrails → escalation. Each agent writes an AgentStep to the database with token usage, tools called, confidence score, and duration — enabling full observability.",
  },
  {
    icon: ShieldCheck,
    title: "Human-in-the-loop approval",
    body: "After the pipeline completes, the Inngest function calls step.waitForEvent() for up to 72 hours. A reviewer reads the drafted reply in an approval queue with SLA timers, edits if needed, and approves or rejects. Every decision is written to an ApprovalAudit table before the Inngest event fires — so the DB is always consistent even if the background worker restarts.",
  },
  {
    icon: GitBranch,
    title: "Guardrails layer",
    body: "A dedicated guardrails agent sits between response drafting and escalation. It runs deterministic PII and secret-pattern regex checks first, then passes the draft to gpt-4o-mini with a policy prompt. Flags are typed (pii | secret | low_confidence | unsupported_claim | internal_leak) and severity-graded (warn | block). Blocked drafts are revised before reaching the reviewer.",
  },
  {
    icon: FlaskConical,
    title: "Eval system",
    body: "Golden examples are bootstrapped from approved investigations via a CLI script. A separate eval runner executes the full agent graph directly (bypassing Inngest) against each example, then an LLM judge scores four dimensions: root cause accuracy (35%), evidence quality (25%), response tone (20%), no hallucinations (20%). Results are stored in EvalRun / EvalResult models and surfaced in a dashboard with pass-rate trend charts.",
  },
  {
    icon: Plug,
    title: "Integration adapter pattern",
    body: "Slack, Sentry, Datadog, and Zendesk each have a real client and a mock behind a shared IIntegrationAdapter interface. The index file returns the real client when the env var is present and the mock otherwise — no conditionals scattered through agent code. All four adapters are tested from the Settings page, which reads live/mock status server-side and passes it to client components as props.",
  },
  {
    icon: Users,
    title: "Org-scoped multi-tenancy",
    body: "Better Auth Organizations provide the tenancy boundary. orgId is stored on Customer, Ticket, and InvestigationRun — with DB indexes. requireOrgAuth() in lib/auth.ts extracts userId + orgId + orgRole from the session and is called by every org-scoped route handler. The sidebar includes an OrgSwitcher so users can move between orgs without re-authenticating.",
  },
];

export function AboutModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-slate-400 hover:text-slate-200 underline underline-offset-4 transition-colors"
      >
        About this project
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Panel */}
          <div
            className="relative z-10 bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-8 py-5 flex items-start justify-between rounded-t-2xl">
              <div>
                <h2 className="text-xl font-semibold text-white">About this project</h2>
                <p className="text-sm text-slate-400 mt-0.5">AI Support Operations Platform — architecture & engineering decisions</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors mt-0.5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-8 py-6 space-y-8">

              {/* Summary */}
              <section className="space-y-3">
                <p className="text-slate-300 leading-relaxed">
                  This is a production-architected multi-agent AI platform built to demonstrate what an
                  engineering team would actually ship to handle automated support ticket investigation at scale.
                  It goes well beyond a tutorial: every design decision — durable orchestration, HITL approval,
                  eval-driven quality measurement, and org-scoped multi-tenancy — mirrors patterns used in
                  real AI product infrastructure.
                </p>
                <p className="text-slate-300 leading-relaxed">
                  The system ingests a support ticket, runs eight specialized AI agents across a LangGraph
                  StateGraph, enforces a guardrails policy on the draft reply, routes it to a human reviewer
                  via a 72-hour approval queue, and posts the approved reply via Slack — with a complete audit
                  trail. A built-in eval suite measures agent output quality across four dimensions using an
                  LLM judge and tracks pass rates over time.
                </p>
              </section>

              {/* Tech stack */}
              <section>
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Stack</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {stack.map((item) => (
                    <div key={item.name} className="bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3">
                      <div className="text-sm font-medium text-white">{item.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5 leading-snug">{item.role}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Engineering highlights */}
              <section>
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Engineering highlights</h3>
                <div className="space-y-5">
                  {highlights.map(({ icon: Icon, title, body }) => (
                    <div key={title} className="flex gap-4">
                      <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center mt-0.5">
                        <Icon className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white mb-1">{title}</div>
                        <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Why it matters */}
              <section className="bg-slate-800/40 border border-slate-700 rounded-xl px-6 py-5 space-y-2">
                <h3 className="text-sm font-semibold text-white">Why this matters to hiring teams</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Most AI demos are stateless prompt wrappers. This one handles the hard parts:
                  durable execution across process restarts, human oversight before messages reach customers,
                  deterministic + LLM-based safety checks, structured observability on every agent call,
                  integration adapters that swap between live and mock without touching agent code,
                  and a rigorous eval loop to catch regressions. These are the decisions that separate
                  a production AI system from a weekend prototype.
                </p>
              </section>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => setOpen(false)}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
