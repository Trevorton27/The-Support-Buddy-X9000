"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PRODUCTS = [
  "Auth Service", "Database Cluster", "Payment Gateway", "CDN",
  "API Gateway", "Worker Queue", "Storage", "Dashboard",
];

const CATEGORIES = [
  "Authentication", "Database", "Payments", "Infrastructure",
  "Deployment", "Performance", "API", "Billing",
];

type Mode = "wizard" | "autonomous" | "incident";
type NoiseLevel = "none" | "low" | "medium" | "high";

interface Customer {
  id: string;
  name: string;
  company: string;
}

interface WizardLauncherProps {
  customers: Customer[];
}

const STEP_LABELS = ["Mode", "Config", "Realism", "Customer", "Review"];

export function WizardLauncher({ customers }: WizardLauncherProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [mode, setMode] = useState<Mode>("wizard");
  const [count, setCount] = useState(5);
  const [products, setProducts] = useState<string[]>(["API Gateway", "Auth Service"]);
  const [categories, setCategories] = useState<string[]>(["Authentication", "API"]);
  const [severityWeights, setSeverityWeights] = useState({
    critical: 10, high: 30, medium: 40, low: 20,
  });
  const [misleadingLogs, setMisleadingLogs] = useState(false);
  const [noiseLevel, setNoiseLevel] = useState<NoiseLevel>("none");
  const [herringCount, setHerringCount] = useState(0);
  const [customerId, setCustomerId] = useState("");
  // Incident scenario fields
  const [scenarioName, setScenarioName] = useState("Database Cascading Failure");
  const [scenarioDesc, setScenarioDesc] = useState("");
  const [scenarioRegion, setScenarioRegion] = useState("us-east-1");
  const [scenarioRootCause, setScenarioRootCause] = useState("");

  function toggleItem(list: string[], setList: (v: string[]) => void, item: string) {
    setList(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    const body: Record<string, unknown> = {
      mode,
      count,
      products,
      categories,
      severityWeights,
      realism: { misleadingLogs, noiseLevel, herringCount },
      ...(customerId ? { customerId } : {}),
    };

    if (mode === "incident") {
      body.incidentScenario = {
        name: scenarioName,
        description: scenarioDesc,
        products,
        region: scenarioRegion,
        ticketCount: count,
        rootCause: scenarioRootCause,
      };
    }

    try {
      const res = await fetch("/api/generate/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { batchId?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      router.push(`/generate/batches/${data.batchId}`);
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                i === step
                  ? "bg-blue-600 text-white"
                  : i < step
                  ? "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 cursor-pointer"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-400"
              }`}
            >
              <span className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px] shrink-0 font-bold border-current">
                {i + 1}
              </span>
              {label}
            </button>
            {i < STEP_LABELS.length - 1 && (
              <div className="w-6 h-px bg-slate-200 dark:bg-slate-700" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Mode */}
      {step === 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Select generation mode</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(["wizard", "autonomous", "incident"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  mode === m
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                <div className="font-medium text-sm capitalize text-slate-900 dark:text-slate-100">{m}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {m === "wizard" && "Configure each parameter manually"}
                  {m === "autonomous" && "Maximize variety across all products"}
                  {m === "incident" && "Generate a cohesive incident scenario"}
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setStep(1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Step 2: Config */}
      {step === 1 && (
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Configure tickets</h3>

          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
              Count: {count} {count > 25 && <span className="text-amber-600">(large batch — runs via background job)</span>}
            </label>
            <input
              type="range" min={1} max={200} value={count}
              onChange={(e) => setCount(parseInt(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-0.5">
              <span>1</span><span>200</span>
            </div>
          </div>

          {mode === "incident" && (
            <div className="space-y-3 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <h4 className="text-xs font-semibold text-orange-700 dark:text-orange-300">Incident Scenario</h4>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400">Scenario Name</label>
                <input
                  className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100"
                  value={scenarioName} onChange={(e) => setScenarioName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400">Description</label>
                <textarea
                  className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 resize-none"
                  rows={2} value={scenarioDesc} onChange={(e) => setScenarioDesc(e.target.value)}
                  placeholder="Describe the incident scenario..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400">Region</label>
                  <input
                    className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm"
                    value={scenarioRegion} onChange={(e) => setScenarioRegion(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400">True Root Cause</label>
                  <input
                    className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm"
                    value={scenarioRootCause} onChange={(e) => setScenarioRootCause(e.target.value)}
                    placeholder="The actual root cause (hidden)"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-2">Products</label>
            <div className="flex flex-wrap gap-2">
              {PRODUCTS.map((p) => (
                <button
                  key={p}
                  onClick={() => toggleItem(products, setProducts, p)}
                  className={`px-2 py-1 rounded text-xs border transition-colors ${
                    products.includes(p)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-2">Categories</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => toggleItem(categories, setCategories, c)}
                  className={`px-2 py-1 rounded text-xs border transition-colors ${
                    categories.includes(c)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-2">Severity Weights (%)</label>
            <div className="grid grid-cols-4 gap-3">
              {(["critical", "high", "medium", "low"] as const).map((s) => (
                <div key={s}>
                  <label className="text-xs text-slate-500 dark:text-slate-400 capitalize">{s}</label>
                  <input
                    type="number" min={0} max={100}
                    value={severityWeights[s]}
                    onChange={(e) => setSeverityWeights({ ...severityWeights, [s]: parseInt(e.target.value) || 0 })}
                    className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-center"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
            <Button onClick={() => setStep(2)} disabled={products.length === 0 || categories.length === 0}>Next</Button>
          </div>
        </div>
      )}

      {/* Step 3: Realism */}
      {step === 2 && (
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Realism settings</h3>

          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700">
            <div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">Misleading logs</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Include plausible but wrong log lines/error codes</div>
            </div>
            <button
              onClick={() => setMisleadingLogs(!misleadingLogs)}
              className={`w-10 h-5 rounded-full transition-colors relative ${misleadingLogs ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${misleadingLogs ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-2">Noise Level</label>
            <div className="grid grid-cols-4 gap-2">
              {(["none", "low", "medium", "high"] as NoiseLevel[]).map((n) => (
                <button
                  key={n}
                  onClick={() => setNoiseLevel(n)}
                  className={`py-2 rounded-lg text-xs border transition-colors capitalize ${
                    noiseLevel === n
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
              Red Herrings per Ticket: {herringCount}
            </label>
            <input
              type="range" min={0} max={3} value={herringCount}
              onChange={(e) => setHerringCount(parseInt(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="text-xs text-slate-400 mt-0.5">Injected misleading faults (tracked in ground truth)</div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)}>Next</Button>
          </div>
        </div>
      )}

      {/* Step 4: Customer */}
      {step === 3 && (
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Customer assignment</h3>
          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-2">
              Assign tickets to customer
            </label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="">Random / First available</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.company}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={() => setStep(4)}>Next</Button>
          </div>
        </div>
      )}

      {/* Step 5: Review */}
      {step === 4 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Review & Generate</h3>

          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
            <div className="flex justify-between">
              <span className="text-slate-500">Mode</span>
              <Badge variant="outline" className="capitalize">{mode}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Count</span>
              <span className="font-medium">{count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Products</span>
              <span className="font-medium text-right max-w-[60%]">{products.join(", ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Severity mix</span>
              <span className="font-medium">
                {Object.entries(severityWeights)
                  .filter(([, w]) => w > 0)
                  .map(([s, w]) => `${s}: ${w}%`)
                  .join(", ")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Realism</span>
              <span className="font-medium">
                {noiseLevel !== "none" ? `noise: ${noiseLevel}` : "none"}
                {misleadingLogs ? " + misleading logs" : ""}
                {herringCount > 0 ? ` + ${herringCount} red herring(s)` : ""}
              </span>
            </div>
            {count > 25 && (
              <div className="text-xs text-amber-600 dark:text-amber-400 pt-1 border-t border-slate-200 dark:border-slate-700">
                Large batch ({count} tickets) will run as a background job via Inngest. You can monitor progress on the batch detail page.
              </div>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Generating…" : `Generate ${count} ticket${count !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
