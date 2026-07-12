import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SettingsView from "@/components/SettingsView";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function configBody() {
  return {
    workspace: ".",
    providers: {
      deepseek: {
        type: "openai" as const,
        apiKey: "***",
        baseUrl: "https://api.deepseek.com/v1",
        timeoutMs: 60000
      }
    },
    agents: {
      default: {
        provider: "deepseek",
        model: "deepseek-chat",
        thinking: { enabled: false, budgetTokens: 16000 },
        effort: 1,
        maxIterations: 10,
        maxToolResultChars: 12000,
        contextWindowTokens: 32000,
        params: {}
      }
    },
    sessions: {
      dir: ".mini-agent/workspace/sessions",
      maxHistoryMessages: 100,
      maxHistoryChars: 200000
    },
    tools: {
      search: {
        backend: "none" as const,
        maxResults: 5
      },
      exec: {
        enabled: false,
        timeoutMs: 30000,
        maxOutputChars: 32000
      }
    }
  };
}

describe("SettingsView", () => {
  it("loads redacted provider config and tools", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/config") {
          return jsonResponse(configBody());
        }
        if (path === "/api/tools") {
          return jsonResponse([{ type: "function", function: { name: "read_file", description: "", parameters: {} } }]);
        }
        return jsonResponse({});
      })
    );

    render(<SettingsView onClose={vi.fn()} />);

    // Provider key is shown as text in the collapsed row; the <select> still has "deepseek"
    const deepseekSelect = await screen.findByDisplayValue("deepseek");
    expect(deepseekSelect).toBeInTheDocument();
    // Expand the provider row to see the API key input
    const providerRow = await screen.findByRole("button", { name: /deepseek/ });
    fireEvent.click(providerRow);
    expect(screen.getByDisplayValue("***")).toBeInTheDocument();
    // Navigate to Tools section to see available tools
    fireEvent.click(screen.getAllByText("Tools")[0]);
    expect(screen.getByText("read_file")).toBeInTheDocument();
  });

  it("saves edited config as a patch", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/config" && init?.method === "PUT") {
        return jsonResponse({
          ...configBody(),
          agents: { default: { ...configBody().agents.default, model: "deepseek-reasoner" } }
        });
      }
      if (path === "/api/config") {
        return jsonResponse(configBody());
      }
      if (path === "/api/tools") {
        return jsonResponse([]);
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SettingsView onClose={vi.fn()} />);

    const modelInput = await screen.findByDisplayValue("deepseek-chat");
    fireEvent.change(modelInput, { target: { value: "deepseek-reasoner" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/config", expect.objectContaining({ method: "PUT" })));
    const putCall = fetchMock.mock.calls.find(([path, init]) => path === "/api/config" && init?.method === "PUT");
    const body = JSON.parse(String(putCall?.[1]?.body));
    expect(body.agents.default.model).toBe("deepseek-reasoner");
    expect(body.agents.default.maxIterations).toBe(10);
    expect(body.providers.deepseek.apiKey).toBe("***");
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });
});
