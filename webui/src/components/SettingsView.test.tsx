import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SettingsView from "./SettingsView";

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
    provider: {
      name: "deepseek",
      apiKey: "***",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat"
    },
    agent: {
      maxIterations: 10,
      maxToolResultChars: 12000
    },
    sessions: {
      dir: ".mini-agent/workspace/sessions",
      defaultKey: "default",
      maxHistoryMessages: 100,
      maxHistoryChars: 200000
    },
    search: {
      backend: "none",
      maxResults: 5
    },
    exec: {
      enabled: false,
      timeoutMs: 30000,
      maxOutputChars: 32000
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

    expect(await screen.findByDisplayValue("deepseek")).toBeInTheDocument();
    expect(screen.getByDisplayValue("***")).toBeInTheDocument();
    expect(screen.getByText("read_file")).toBeInTheDocument();
  });

  it("saves edited config as a patch", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/config" && init?.method === "PUT") {
        return jsonResponse({
          ...configBody(),
          provider: { ...configBody().provider, model: "deepseek-reasoner" }
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
    expect(JSON.parse(String(putCall?.[1]?.body))).toMatchObject({
      provider: {
        apiKey: "***",
        model: "deepseek-reasoner"
      },
      agent: {
        maxIterations: 10
      }
    });
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });
});
