import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AboutModal } from "@/components/about-modal";

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect("/mission-control");

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center text-white px-4">
      <div className="max-w-3xl text-center space-y-8">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm text-slate-300">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Multi-agent AI system
          </div>
          <h1 className="text-5xl font-bold tracking-tight">
            The Support Buddy X9000
          </h1>
          <h3 className="text-2xl font-semibold text-slate-300">
            Your AI-powered support
            <span className="text-blue-400"> mission control</span>
          </h3>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            AI-powered support mission control with intelligent work prioritization,
            multi-agent investigation, and automated triage — all in one place.
          </p>
        </div>

        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/sign-in">
            <Button size="lg" className="bg-blue-500 hover:bg-blue-600 text-white px-8">
              Sign In
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 px-8">
              Get Started
            </Button>
          </Link>
        </div>

        <div className="flex justify-center pt-2">
          <AboutModal />
        </div>

        <div className="grid grid-cols-3 gap-6 pt-4 text-left">
          {[
            { label: "Agents", value: "8", desc: "Specialized AI agents running in parallel" },
            { label: "Avg Resolution", value: "< 30s", desc: "From ticket submission to investigation complete" },
            { label: "Accuracy", value: "94%", desc: "Root cause hypothesis confidence on known issues" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="text-3xl font-bold text-blue-400">{stat.value}</div>
              <div className="text-sm font-medium mt-1">{stat.label}</div>
              <div className="text-xs text-slate-400 mt-1">{stat.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
