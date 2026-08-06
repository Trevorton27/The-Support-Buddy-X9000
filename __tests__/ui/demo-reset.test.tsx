// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DemoReset } from "@/components/settings/demo-reset";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("confirm", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DemoReset", () => {
  it("renders the description and reset button", () => {
    render(<DemoReset />);
    expect(screen.getByText(/deletes all investigation runs/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reset demo database/i })).toBeInTheDocument();
  });

  it("does not call fetch when user cancels the confirm dialog", async () => {
    vi.mocked(confirm).mockReturnValue(false);
    render(<DemoReset />);
    await userEvent.click(screen.getByRole("button", { name: /reset demo database/i }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls POST /api/seed when user confirms", async () => {
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "Reset complete" }), { status: 200 })
    );
    render(<DemoReset />);
    await userEvent.click(screen.getByRole("button", { name: /reset demo database/i }));
    expect(fetch).toHaveBeenCalledWith("/api/seed", { method: "POST" });
  });

  it("shows 'Resetting…' on the button while the request is in flight", async () => {
    vi.mocked(confirm).mockReturnValue(true);
    let resolveRequest!: (v: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((res) => { resolveRequest = res; })
    );
    render(<DemoReset />);
    await userEvent.click(screen.getByRole("button", { name: /reset demo database/i }));
    expect(await screen.findByText(/resetting/i)).toBeInTheDocument();
    resolveRequest(new Response(JSON.stringify({ message: "Done" }), { status: 200 }));
  });

  it("button is disabled while resetting", async () => {
    vi.mocked(confirm).mockReturnValue(true);
    let resolveRequest!: (v: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((res) => { resolveRequest = res; })
    );
    render(<DemoReset />);
    await userEvent.click(screen.getByRole("button", { name: /reset demo database/i }));
    expect(screen.getByRole("button")).toBeDisabled();
    resolveRequest(new Response(JSON.stringify({ message: "Done" }), { status: 200 }));
  });

  it("displays success message from API response", async () => {
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "Database reset and seeded" }), { status: 200 })
    );
    render(<DemoReset />);
    await userEvent.click(screen.getByRole("button", { name: /reset demo database/i }));
    expect(await screen.findByText("Database reset and seeded")).toBeInTheDocument();
  });

  it("displays error message when fetch throws", async () => {
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));
    render(<DemoReset />);
    await userEvent.click(screen.getByRole("button", { name: /reset demo database/i }));
    expect(await screen.findByText(/reset failed/i)).toBeInTheDocument();
  });

  it("re-enables the button after the request completes", async () => {
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "Done" }), { status: 200 })
    );
    render(<DemoReset />);
    await userEvent.click(screen.getByRole("button", { name: /reset demo database/i }));
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
  });
});
