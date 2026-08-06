import { Badge } from "@/components/ui/badge";

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
  medium: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  hard: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
};

interface DifficultyBadgeProps {
  difficulty: string;
}

export function DifficultyBadge({ difficulty }: DifficultyBadgeProps) {
  const style = DIFFICULTY_STYLES[difficulty] ?? DIFFICULTY_STYLES.medium;
  return (
    <Badge variant="outline" className={style}>
      {difficulty}
    </Badge>
  );
}
