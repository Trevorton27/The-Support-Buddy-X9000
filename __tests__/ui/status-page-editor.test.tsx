// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusPageEditor } from "@/components/incidents/status-page-editor";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const INCIDENT_ID = "incident-xyz";
const INITIAL_MSG = "We are investigating a payment processing issue.";

describe("StatusPageEditor", () => {
  describe("initial render", () => {
    it("renders the textarea with the initial message", () => {
      render(<StatusPageEditor incidentId={INCIDENT_ID} initialMessage={INITIAL_MSG} />);
      expect(screen.getByDisplayValue(INITIAL_MSG)).toBeInTheDocument();
    });

    it("renders with empty textarea when initialMessage is null", () => {
      render(<StatusPageEditor incidentId={INCIDENT_ID} initialMessage={null} />);
      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveValue("");
    });

    it("shows Save Message button", () => {
      render(<StatusPageEditor incidentId={INCIDENT_ID} initialMessage={INITIAL_MSG} />);
      expect(screen.getByRole("button", { name: /save message/i })).toBeInTheDocument();
    });

    it("shows Preview button", () => {
      render(<StatusPageEditor incidentId={INCIDENT_ID} initialMessage={INITIAL_MSG} />);
      expect(screen.getByRole("button", { name: /preview/i })).toBeInTheDocument();
    });
  });

  describe("preview toggle", () => {
    it("clicking Preview hides the textarea and shows the message content", async () => {
      render(<StatusPageEditor incidentId={INCIDENT_ID} initialMessage={INITIAL_MSG} />);
      await userEvent.click(screen.getByRole("button", { name: /preview/i }));
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByText(INITIAL_MSG)).toBeInTheDocument();
    });

    it("shows 'No message set' placeholder in preview when message is empty", async () => {
      render(<StatusPageEditor incidentId={INCIDENT_ID} initialMessage={null} />);
      await userEvent.click(screen.getByRole("button", { name: /preview/i }));
      expect(screen.getByText(/no message set/i)).toBeInTheDocument();
    });

    it("Preview button label changes to 'Edit' in preview mode", async () => {
      render(<StatusPageEditor incidentId={INCIDENT_ID} initialMessage={INITIAL_MSG} />);
      await userEvent.click(screen.getByRole("button", { name: /preview/i }));
      expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    });

    it("clicking Edit in preview mode returns to edit mode with textarea", async () => {
      render(<StatusPageEditor incidentId={INCIDENT_ID} initialMessage={INITIAL_MSG} />);
      await userEvent.click(screen.getByRole("button", { name: /preview/i }));
      await userEvent.click(screen.getByRole("button", { name: /edit/i }));
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("preview reflects changes made in edit mode", async () => {
      render(<StatusPageEditor incidentId={INCIDENT_ID} initialMessage="Original" />);
      const textarea = screen.getByRole("textbox");
      await userEvent.clear(textarea);
      await userEvent.type(textarea, "Updated status message");
      await userEvent.click(screen.getByRole("button", { name: /preview/i }));
      expect(screen.getByText("Updated status message")).toBeInTheDocument();
    });
  });

  describe("save action", () => {
    it("calls PATCH /api/incidents/{id} with the message on save", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
      render(<StatusPageEditor incidentId={INCIDENT_ID} initialMessage={INITIAL_MSG} />);
      await userEvent.click(screen.getByRole("button", { name: /save message/i }));
      expect(fetch).toHaveBeenCalledWith(
        `/api/incidents/${INCIDENT_ID}`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ statusPageMessage: INITIAL_MSG }),
        })
      );
    });

    it("button text changes to 'Saving…' during the request", async () => {
      let resolve!: (v: Response) => void;
      vi.mocked(fetch).mockReturnValue(new Promise<Response>((r) => { resolve = r; }));
      render(<StatusPageEditor incidentId={INCIDENT_ID} initialMessage={INITIAL_MSG} />);
      await userEvent.click(screen.getByRole("button", { name: /save message/i }));
      expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument();
      resolve(new Response("{}", { status: 200 }));
    });

    it("shows 'Saved!' text after successful save", async () => {
      // No fake timers — the saved=true state is set immediately after fetch resolves.
      // The 2s revert setTimeout doesn't affect this assertion.
      vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
      render(<StatusPageEditor incidentId={INCIDENT_ID} initialMessage={INITIAL_MSG} />);
      await userEvent.click(screen.getByRole("button", { name: /save message/i }));
      expect(await screen.findByText(/saved!/i)).toBeInTheDocument();
    });

    it("'Saved!' label appears in the status text after save", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
      render(<StatusPageEditor incidentId={INCIDENT_ID} initialMessage={INITIAL_MSG} />);
      await userEvent.click(screen.getByRole("button", { name: /save message/i }));
      expect(await screen.findByText("Status page updated")).toBeInTheDocument();
    });

    it("button is disabled while saving", async () => {
      let resolve!: (v: Response) => void;
      vi.mocked(fetch).mockReturnValue(new Promise<Response>((r) => { resolve = r; }));
      render(<StatusPageEditor incidentId={INCIDENT_ID} initialMessage={INITIAL_MSG} />);
      await userEvent.click(screen.getByRole("button", { name: /save message/i }));
      expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
      resolve(new Response("{}", { status: 200 }));
    });

    it("re-enables save button after completion", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
      render(<StatusPageEditor incidentId={INCIDENT_ID} initialMessage={INITIAL_MSG} />);
      await userEvent.click(screen.getByRole("button", { name: /save message/i }));
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: /saving/i })).not.toBeInTheDocument()
      );
    });
  });
});
