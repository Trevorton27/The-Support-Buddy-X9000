"use client";

import { DevinTaskCard, type SerializedDevinTask } from "./devin-task-card";
import { Bot } from "lucide-react";

interface DevinTasksSectionProps {
  tasks: SerializedDevinTask[];
}

export function DevinTasksSection({ tasks }: DevinTasksSectionProps) {
  if (tasks.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
        <Bot className="w-4 h-4" />
        Devin Tasks
      </h3>
      {tasks.map((task) => (
        <DevinTaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}
