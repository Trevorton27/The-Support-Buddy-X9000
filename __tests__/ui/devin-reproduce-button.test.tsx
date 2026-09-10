// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReproduceButton } from "@/components/devin/reproduce-button";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("ReproduceButton", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders with correct text", () => {
    render(<ReproduceButton ticketId="t1" investigationRunId="r1" />);
    expect(screen.getByText("Reproduce with Devin")).toBeDefined();
  });

  it("disabled state works", () => {
    render(<ReproduceButton ticketId="t1" investigationRunId="r1" disabled />);
    const button = screen.getByRole("button");
    expect(button).toHaveProperty("disabled", true);
  });

  it("shows confirmation dialog on click", () => {
    render(<ReproduceButton ticketId="t1" investigationRunId="r1" />);
    fireEvent.click(screen.getByText("Reproduce with Devin"));
    expect(screen.getByText("Confirm: Reproduce with Devin")).toBeDefined();
    expect(screen.getByText(/Reproduction only/)).toBeDefined();
  });

  it("sends correct API request on confirm", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "task-1", workItemId: "wi-1", status: "queued" }),
    });

    render(<ReproduceButton ticketId="t1" investigationRunId="r1" />);
    fireEvent.click(screen.getByText("Reproduce with Devin"));
    fireEvent.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/devin/tasks", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          mode: "reproduce",
          ticketId: "t1",
          investigationRunId: "r1",
        }),
      }));
    });
  });

  it("shows hasActiveTask message", () => {
    render(<ReproduceButton ticketId="t1" investigationRunId="r1" hasActiveTask />);
    expect(screen.getByText("Reproduction in progress")).toBeDefined();
    expect(screen.getByRole("button")).toHaveProperty("disabled", true);
  });
});
