import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { KnowledgeGeneratorForm } from "@/components/generate/knowledge-generator-form";

export default async function KnowledgeGeneratorPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Knowledge Generator</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Generate synthetic runbooks, incident reports, and documentation for your knowledge base.
          After generating, run <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">npm run ingest</code> to embed the new documents.
        </p>
      </div>

      <KnowledgeGeneratorForm />
    </div>
  );
}
