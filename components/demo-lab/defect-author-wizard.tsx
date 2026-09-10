"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Bot, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const SERVICES = [
  { id: "auth-service", label: "Auth Service", desc: "Authentication, sessions, SAML" },
  { id: "webhook-dispatcher", label: "Webhook Dispatcher", desc: "Event delivery, signatures" },
  { id: "order-service", label: "Order Service", desc: "Order processing, queries" },
  { id: "billing-service", label: "Billing Service", desc: "Payments, API keys" },
  { id: "rate-limiter", label: "Rate Limiter", desc: "Token buckets, throttling" },
  { id: "database-client", label: "Database Client", desc: "Connection pools, queries" },
];

const DEFECT_CLASSES = [
  { id: "off-by-one", label: "Off-by-one", desc: "Array bounds, loop limits" },
  { id: "missing-null-check", label: "Missing null check", desc: "Unhandled undefined/null" },
  { id: "wrong-default", label: "Wrong default", desc: "Incorrect fallback value" },
  { id: "race-condition", label: "Race condition", desc: "Timing-dependent failures" },
  { id: "stale-cache", label: "Stale cache", desc: "Outdated cached data" },
  { id: "incorrect-comparison", label: "Incorrect comparison", desc: "Wrong operator or operand" },
  { id: "missing-validation", label: "Missing validation", desc: "Input not checked" },
  { id: "wrong-error-handling", label: "Wrong error handling", desc: "Swallowed or wrong errors" },
  { id: "hardcoded-value", label: "Hardcoded value", desc: "Config ignored, literal used" },
  { id: "type-coercion", label: "Type coercion", desc: "Implicit type conversion bug" },
];

const DIFFICULTIES = [
  { id: "easy", label: "Easy", desc: "Single line fix, obvious once found", color: "text-green-600" },
  { id: "medium", label: "Medium", desc: "Requires understanding context", color: "text-amber-600" },
  { id: "hard", label: "Hard", desc: "Subtle, requires deep analysis", color: "text-red-600" },
];

type Step = "service" | "defect" | "difficulty" | "guidance" | "confirm";
const STEPS: Step[] = ["service", "defect", "difficulty", "guidance", "confirm"];

export function DefectAuthorWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("service");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  // Selections
  const [service, setService] = useState("");
  const [defectClass, setDefectClass] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [guidance, setGuidance] = useState("");

  function reset() {
    setStep("service");
    setService("");
    setDefectClass("");
    setDifficulty("");
    setGuidance("");
    setError(null);
    setTaskId(null);
  }

  function nextStep() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }

  function prevStep() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }

  async function handleDispatch() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/demo-lab/defect-author", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          defectClass,
          difficulty,
          ...(guidance && { guidance }),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Dispatch failed");
        return;
      }

      setTaskId(data.taskId);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="text-xs bg-orange-600 hover:bg-orange-700 text-white"
      >
        <Bot className="w-3 h-3 mr-1" />
        Devin: Author Defect
      </Button>
    );
  }

  // Success state
  if (taskId) {
    return (
      <div className="border border-green-200 dark:border-green-800 rounded-xl p-5 space-y-3 bg-green-50/50 dark:bg-green-950/20">
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-green-600" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Defect Author Task Dispatched
          </h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Devin is creating a defect in <strong>{service}</strong> ({defectClass}, {difficulty}).
          The task will appear in the Devin task list and a new scenario will be created when complete.
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">Task ID: {taskId}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setOpen(false); reset(); }} className="text-xs">
            Close
          </Button>
          <Button size="sm" variant="outline" onClick={() => { reset(); setStep("service"); }} className="text-xs">
            Create Another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-orange-200 dark:border-orange-800 rounded-xl p-5 space-y-4 bg-orange-50/50 dark:bg-orange-950/20">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Devin: Author a Defect
        </h3>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); reset(); }} className="text-xs">
          Cancel
        </Button>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-1 text-xs text-slate-400">
        {STEPS.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            <span className={step === s ? "text-orange-600 font-medium" : s === "confirm" ? "" : ""}>
              {s === "service" ? "Service" : s === "defect" ? "Defect Class" : s === "difficulty" ? "Difficulty" : s === "guidance" ? "Guidance" : "Confirm"}
            </span>
            {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3" />}
          </span>
        ))}
      </div>

      {/* Step 1: Service */}
      {step === "service" && (
        <div className="grid grid-cols-2 gap-2">
          {SERVICES.map((s) => (
            <button
              key={s.id}
              onClick={() => { setService(s.id); nextStep(); }}
              className={`text-left p-2.5 rounded-lg border text-xs transition-colors ${
                service === s.id
                  ? "border-orange-400 bg-orange-50 dark:bg-orange-950/30"
                  : "border-slate-200 dark:border-slate-700 hover:border-orange-300"
              }`}
            >
              <span className="font-medium text-slate-900 dark:text-slate-100">{s.label}</span>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5">{s.desc}</p>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Defect Class */}
      {step === "defect" && (
        <div className="grid grid-cols-2 gap-2">
          {DEFECT_CLASSES.map((d) => (
            <button
              key={d.id}
              onClick={() => { setDefectClass(d.id); nextStep(); }}
              className={`text-left p-2.5 rounded-lg border text-xs transition-colors ${
                defectClass === d.id
                  ? "border-orange-400 bg-orange-50 dark:bg-orange-950/30"
                  : "border-slate-200 dark:border-slate-700 hover:border-orange-300"
              }`}
            >
              <span className="font-medium text-slate-900 dark:text-slate-100">{d.label}</span>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5">{d.desc}</p>
            </button>
          ))}
        </div>
      )}

      {/* Step 3: Difficulty */}
      {step === "difficulty" && (
        <div className="space-y-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => { setDifficulty(d.id); nextStep(); }}
              className={`w-full text-left p-3 rounded-lg border text-xs transition-colors ${
                difficulty === d.id
                  ? "border-orange-400 bg-orange-50 dark:bg-orange-950/30"
                  : "border-slate-200 dark:border-slate-700 hover:border-orange-300"
              }`}
            >
              <span className={`font-medium ${d.color}`}>{d.label}</span>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5">{d.desc}</p>
            </button>
          ))}
        </div>
      )}

      {/* Step 4: Guidance */}
      {step === "guidance" && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
              Additional guidance for Devin (optional)
            </label>
            <textarea
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder="e.g. Focus on the session management layer, make it a timing-dependent issue..."
              className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 h-20 resize-none"
              maxLength={500}
            />
          </div>
          <Button size="sm" onClick={nextStep} className="text-xs">
            Continue <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      )}

      {/* Step 5: Confirm */}
      {step === "confirm" && (
        <div className="space-y-3">
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2 bg-white dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-900 dark:text-slate-100">Summary</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-xs">{service}</Badge>
              <Badge variant="outline" className="text-xs">{defectClass}</Badge>
              <Badge variant="outline" className="text-xs">{difficulty}</Badge>
            </div>
            {guidance && (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">{guidance}</p>
            )}
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
              Devin will create a branch with a defect, regression test, and manifest file.
              A new scenario will be auto-created when complete.
            </p>
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={prevStep} className="text-xs">
              Back
            </Button>
            <Button
              size="sm"
              onClick={handleDispatch}
              disabled={loading}
              className="text-xs bg-orange-600 hover:bg-orange-700 text-white"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Bot className="w-3 h-3 mr-1" />}
              Dispatch to Devin
            </Button>
          </div>
        </div>
      )}

      {/* Back button for steps 2-4 */}
      {(step === "defect" || step === "difficulty") && (
        <Button size="sm" variant="ghost" onClick={prevStep} className="text-xs">
          Back
        </Button>
      )}
    </div>
  );
}
