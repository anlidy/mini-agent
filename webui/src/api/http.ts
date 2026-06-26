export async function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function apiDelete(path: string): Promise<void> {
  await request<void>(path, { method: "DELETE" });
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.status === 204) {
    return undefined as T;
  }

  const data = await parseResponseBody(response, path);

  if (!response.ok) {
    const error = data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : `Request failed with ${response.status}`;
    throw new Error(error);
  }

  return data as T;
}

async function parseResponseBody(response: Response, path: string): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Invalid JSON response from ${path}`);
  }
}
