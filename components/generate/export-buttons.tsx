"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

interface ExportButtonsProps {
  batchId: string;
}

export function ExportButtons({ batchId }: ExportButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleExport(format: "json" | "csv" | "markdown") {
    setLoading(format);
    try {
      const res = await fetch(`/api/generate/batches/${batchId}/export?format=${format}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `batch-${batchId}.${format === "markdown" ? "md" : format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleExport("json")}
        disabled={loading !== null}
      >
        {loading === "json" ? "Exporting…" : "Export JSON"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleExport("csv")}
        disabled={loading !== null}
      >
        {loading === "csv" ? "Exporting…" : "Export CSV"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleExport("markdown")}
        disabled={loading !== null}
      >
        {loading === "markdown" ? "Exporting…" : "Export Markdown"}
      </Button>
    </div>
  );
}
