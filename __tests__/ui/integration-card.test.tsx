// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntegrationCard } from "@/components/settings/integration-card";

const BASE_PROPS = {
  name: "Slack",
  type: "slack",
  description: "Post alerts to a Slack channel.",
  isLive: false,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IntegrationCard", () => {
  describe("status badge", () => {
    it("shows 'mock' badge when isLive is false", () => {
      render(<IntegrationCard {...BASE_PROPS} />);
      expect(screen.getByText("mock")).toBeInTheDocument();
    });

    it("shows 'live' badge when isLive is true", () => {
      render(<IntegrationCard {...BASE_PROPS} isLive={true} />);
      expect(screen.getByText("live")).toBeInTheDocument();
    });

    it("renders the integration name", () => {
      render(<IntegrationCard {...BASE_PROPS} />);
      expect(screen.getByText("Slack")).toBeInTheDocument();
    });

    it("renders the description", () => {
      render(<IntegrationCard {...BASE_PROPS} />);
      expect(screen.getByText(/post alerts to a slack channel/i)).toBeInTheDocument();
    });
  });

  describe("mock mode hint", () => {
    it("shows env variable hint in mock mode", () => {
      render(<IntegrationCard {...BASE_PROPS} />);
      expect(screen.getByText(/SLACK_API_TOKEN/)).toBeInTheDocument();
    });

    it("does not show env variable hint in live mode", () => {
      render(<IntegrationCard {...BASE_PROPS} isLive={true} />);
      expect(screen.queryByText(/API_TOKEN/)).not.toBeInTheDocument();
    });
  });

  describe("last sync time", () => {
    it("shows last sync when provided", () => {
      const lastSyncAt = new Date("2024-01-01T10:00:00Z");
      render(<IntegrationCard {...BASE_PROPS} lastSyncAt={lastSyncAt} />);
      expect(screen.getByText(/last sync/i)).toBeInTheDocument();
    });

    it("does not show last sync when not provided", () => {
      render(<IntegrationCard {...BASE_PROPS} />);
      expect(screen.queryByText(/last sync/i)).not.toBeInTheDocument();
    });
  });

  describe("Test Connection button", () => {
    it("renders Test Connection button when testEndpoint is provided", () => {
      render(<IntegrationCard {...BASE_PROPS} testEndpoint="/api/integrations/slack/test" />);
      expect(screen.getByRole("button", { name: /test connection/i })).toBeInTheDocument();
    });

    it("does not render Test Connection button when testEndpoint is absent", () => {
      render(<IntegrationCard {...BASE_PROPS} />);
      expect(screen.queryByRole("button", { name: /test connection/i })).not.toBeInTheDocument();
    });

    it("calls the testEndpoint with POST when clicked", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ ok: true, message: "Connected" }), { status: 200 })
      );
      render(<IntegrationCard {...BASE_PROPS} testEndpoint="/api/integrations/slack/test" />);
      await userEvent.click(screen.getByRole("button", { name: /test connection/i }));
      expect(fetch).toHaveBeenCalledWith("/api/integrations/slack/test", { method: "POST" });
    });

    it("shows success message when test returns ok:true", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ ok: true, message: "Webhook delivered" }), { status: 200 })
      );
      render(<IntegrationCard {...BASE_PROPS} testEndpoint="/api/integrations/slack/test" />);
      await userEvent.click(screen.getByRole("button", { name: /test connection/i }));
      expect(await screen.findByText("Webhook delivered")).toBeInTheDocument();
    });

    it("shows error message when test returns ok:false", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ ok: false, message: "Connection refused" }), { status: 200 })
      );
      render(<IntegrationCard {...BASE_PROPS} testEndpoint="/api/integrations/slack/test" />);
      await userEvent.click(screen.getByRole("button", { name: /test connection/i }));
      expect(await screen.findByText("Connection refused")).toBeInTheDocument();
    });

    it("shows 'Request failed' when fetch throws", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("Network down"));
      render(<IntegrationCard {...BASE_PROPS} testEndpoint="/api/integrations/slack/test" />);
      await userEvent.click(screen.getByRole("button", { name: /test connection/i }));
      expect(await screen.findByText("Request failed")).toBeInTheDocument();
    });

    it("button is disabled during the test request", async () => {
      let resolve!: (v: Response) => void;
      vi.mocked(fetch).mockReturnValue(new Promise<Response>((r) => { resolve = r; }));
      render(<IntegrationCard {...BASE_PROPS} testEndpoint="/api/integrations/slack/test" />);
      await userEvent.click(screen.getByRole("button", { name: /test connection/i }));
      expect(screen.getByRole("button", { name: /test connection/i })).toBeDisabled();
      resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    it("re-enables button after test completes", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
      render(<IntegrationCard {...BASE_PROPS} testEndpoint="/api/integrations/slack/test" />);
      await userEvent.click(screen.getByRole("button", { name: /test connection/i }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /test connection/i })).not.toBeDisabled()
      );
    });
  });
});
