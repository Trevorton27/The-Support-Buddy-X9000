import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cn,
  formatDuration,
  formatRelativeTime,
  truncate,
  slugify,
  severityColor,
} from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });

  it("deduplicates tailwind conflicts", () => {
    expect(cn("p-4", "p-8")).toBe("p-8");
  });
});

describe("formatDuration", () => {
  it("shows milliseconds under 1s", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("shows seconds between 1s and 1m", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(59999)).toBe("60.0s");
  });

  it("shows minutes at 1m+", () => {
    expect(formatDuration(60000)).toBe("1.0m");
    expect(formatDuration(90000)).toBe("1.5m");
    expect(formatDuration(120000)).toBe("2.0m");
  });
});

describe("truncate", () => {
  it("returns string unchanged when within limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis when over limit", () => {
    expect(truncate("hello world", 5)).toBe("hello...");
    expect(truncate("abcdef", 3)).toBe("abc...");
  });
});

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("  hello  ")).toBe("hello");
  });

  it("collapses multiple special chars into one hyphen", () => {
    expect(slugify("foo & bar!")).toBe("foo-bar");
  });

  it("handles already-slugified strings", () => {
    expect(slugify("foo-bar")).toBe("foo-bar");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:00:00Z"));
  });

  it("shows 'just now' for sub-minute", () => {
    expect(formatRelativeTime(new Date("2025-01-01T11:59:30Z"))).toBe("just now");
  });

  it("shows minutes ago", () => {
    expect(formatRelativeTime(new Date("2025-01-01T11:55:00Z"))).toBe("5m ago");
  });

  it("shows hours ago", () => {
    expect(formatRelativeTime(new Date("2025-01-01T09:00:00Z"))).toBe("3h ago");
  });

  it("shows days ago", () => {
    expect(formatRelativeTime(new Date("2024-12-30T12:00:00Z"))).toBe("2d ago");
  });

  it("accepts ISO string as input", () => {
    expect(formatRelativeTime("2025-01-01T11:58:00Z")).toBe("2m ago");
  });
});

describe("severityColor", () => {
  it("maps critical to destructive", () => {
    expect(severityColor("critical")).toBe("destructive");
  });

  it("maps high to warning", () => {
    expect(severityColor("high")).toBe("warning");
  });

  it("maps medium to secondary", () => {
    expect(severityColor("medium")).toBe("secondary");
  });

  it("maps low to outline", () => {
    expect(severityColor("low")).toBe("outline");
  });

  it("maps unknown values to outline", () => {
    expect(severityColor("unknown")).toBe("outline");
    expect(severityColor("")).toBe("outline");
  });

  it("is case-insensitive", () => {
    expect(severityColor("CRITICAL")).toBe("destructive");
    expect(severityColor("High")).toBe("warning");
  });
});
