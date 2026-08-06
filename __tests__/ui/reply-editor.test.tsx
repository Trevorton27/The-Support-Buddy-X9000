// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReplyEditor } from "@/components/approvals/reply-editor";

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  mockPush.mockClear();
  mockRefresh.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const DRAFT = "Dear customer, we have investigated your issue.";
const RUN_ID = "run-abc-123";

describe("ReplyEditor", () => {
  describe("initial render", () => {
    it("shows the original draft in the reply textarea", () => {
      render(<ReplyEditor runId={RUN_ID} originalDraft={DRAFT} />);
      expect(screen.getByDisplayValue(DRAFT)).toBeInTheDocument();
    });

    it("does not show the 'Draft edited' indicator initially", () => {
      render(<ReplyEditor runId={RUN_ID} originalDraft={DRAFT} />);
      expect(screen.queryByText(/draft edited/i)).not.toBeInTheDocument();
    });

    it("renders Approve & Send and Reject buttons", () => {
      render(<ReplyEditor runId={RUN_ID} originalDraft={DRAFT} />);
      expect(screen.getByRole("button", { name: /approve & send/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
    });
  });

  describe("draft editing", () => {
    it("shows 'Draft edited' indicator when the reply is changed", async () => {
      render(<ReplyEditor runId={RUN_ID} originalDraft={DRAFT} />);
      const textarea = screen.getByDisplayValue(DRAFT);
      await userEvent.clear(textarea);
      await userEvent.type(textarea, "Modified reply");
      expect(screen.getByText(/draft edited/i)).toBeInTheDocument();
    });

    it("does not show indicator when text is reverted to original", async () => {
      render(<ReplyEditor runId={RUN_ID} originalDraft="Hello" />);
      const textarea = screen.getByDisplayValue("Hello");
      await userEvent.clear(textarea);
      await userEvent.type(textarea, "Hello");
      expect(screen.queryByText(/draft edited/i)).not.toBeInTheDocument();
    });
  });

  describe("approve action", () => {
    it("POSTs to approve endpoint with action:approved on click", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
      render(<ReplyEditor runId={RUN_ID} originalDraft={DRAFT} />);
      await userEvent.click(screen.getByRole("button", { name: /approve & send/i }));
      expect(fetch).toHaveBeenCalledWith(
        `/api/investigations/${RUN_ID}/approve`,
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"action":"approved"'),
        })
      );
    });

    it("sends editedReply in body only when draft is modified", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
      render(<ReplyEditor runId={RUN_ID} originalDraft={DRAFT} />);
      const textarea = screen.getByDisplayValue(DRAFT);
      await userEvent.clear(textarea);
      await userEvent.type(textarea, "New reply text");
      await userEvent.click(screen.getByRole("button", { name: /approve & send/i }));
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
      expect(body.editedReply).toBe("New reply text");
    });

    it("does not send editedReply when draft is unchanged", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
      render(<ReplyEditor runId={RUN_ID} originalDraft={DRAFT} />);
      await userEvent.click(screen.getByRole("button", { name: /approve & send/i }));
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
      expect(body.editedReply).toBeUndefined();
    });

    it("includes reviewer note in body when filled in", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
      render(<ReplyEditor runId={RUN_ID} originalDraft={DRAFT} />);
      const noteField = screen.getByPlaceholderText(/reviewer note/i);
      await userEvent.type(noteField, "Looks good");
      await userEvent.click(screen.getByRole("button", { name: /approve & send/i }));
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
      expect(body.note).toBe("Looks good");
    });

    it("does not send note when the note field is empty", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
      render(<ReplyEditor runId={RUN_ID} originalDraft={DRAFT} />);
      await userEvent.click(screen.getByRole("button", { name: /approve & send/i }));
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
      expect(body.note).toBeUndefined();
    });

    it("redirects to /approvals after successful approval", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
      render(<ReplyEditor runId={RUN_ID} originalDraft={DRAFT} />);
      await userEvent.click(screen.getByRole("button", { name: /approve & send/i }));
      await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/approvals"));
    });
  });

  describe("reject action", () => {
    it("POSTs with action:rejected when Reject is clicked", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
      render(<ReplyEditor runId={RUN_ID} originalDraft={DRAFT} />);
      await userEvent.click(screen.getByRole("button", { name: /reject/i }));
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
      expect(body.action).toBe("rejected");
    });
  });

  describe("loading state", () => {
    it("disables both buttons while submitting", async () => {
      let resolve!: (v: Response) => void;
      vi.mocked(fetch).mockReturnValue(new Promise<Response>((r) => { resolve = r; }));
      render(<ReplyEditor runId={RUN_ID} originalDraft={DRAFT} />);
      await userEvent.click(screen.getByRole("button", { name: /approve & send/i }));
      expect(screen.getByRole("button", { name: /submitting/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /reject/i })).toBeDisabled();
      resolve(new Response("{}", { status: 200 }));
    });
  });

  describe("error handling", () => {
    it("shows error message when API returns non-ok status", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: "Permission denied" }), { status: 403 })
      );
      render(<ReplyEditor runId={RUN_ID} originalDraft={DRAFT} />);
      await userEvent.click(screen.getByRole("button", { name: /approve & send/i }));
      expect(await screen.findByText(/permission denied/i)).toBeInTheDocument();
    });

    it("re-enables buttons after an error", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
      );
      render(<ReplyEditor runId={RUN_ID} originalDraft={DRAFT} />);
      await userEvent.click(screen.getByRole("button", { name: /approve & send/i }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /approve & send/i })).not.toBeDisabled()
      );
    });
  });
});
