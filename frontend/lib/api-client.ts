import { ApiError } from "./errors";
import type { ApiResponse } from "@/types";

export const API_PREFIX = "/api/v1";

export const API_ENDPOINTS = {
  sessions: "/sessions",
  session: (sessionId: string) => `/sessions/${sessionId}`,
  sessionMessages: (sessionId: string) => `/sessions/${sessionId}/messages`,
  sessionToolExecutions: (sessionId: string) =>
    `/sessions/${sessionId}/tool-executions`,
  sessionUsage: (sessionId: string) => `/sessions/${sessionId}/usage`,
  sessionWorkspaceFiles: (sessionId: string) =>
    `/sessions/${sessionId}/workspace/files`,
  sessionWorkspaceFile: (sessionId: string, filePath: string) =>
    `/sessions/${sessionId}/workspace/file?path=${encodeURIComponent(filePath)}`,
  tasks: "/tasks",
  tasksHistory: "/tasks/history",
  runs: "/runs",
  run: (runId: string) => `/runs/${runId}`,
  runsBySession: (sessionId: string) => `/runs/session/${sessionId}`,
  projects: "/projects",
  project: (projectId: string) => `/projects/${projectId}`,
  skills: "/skills",
  schedules: "/schedules",
  health: "/health",
};

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || process.env.API_BASE_URL || "";

export function getApiBaseUrl() {
  if (!API_BASE_URL) {
    throw new ApiError("API base URL is not configured", 500);
  }
  return API_BASE_URL;
}

async function resolveAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") {
    try {
      const { cookies } = await import("next/headers");
      return (
        cookies().get("access_token")?.value ||
        cookies().get("token")?.value ||
        null
      );
    } catch {
      return null;
    }
  }

  try {
    return (
      window.localStorage.getItem("access_token") ||
      window.localStorage.getItem("token") ||
      null
    );
  } catch {
    return null;
  }
}

function normalizeBody(body: unknown): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string" || body instanceof FormData) return body;
  return JSON.stringify(body);
}

export type ApiFetchOptions = RequestInit & {
  next?: {
    revalidate?: number;
    tags?: string[];
  };
};

export async function apiFetch<T>(
  endpoint: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const url = `${getApiBaseUrl()}${API_PREFIX}${endpoint}`;
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const token = await resolveAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body: normalizeBody(options.body),
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message?: string }).message)
        : response.statusText;
    throw new ApiError(
      message || "API request failed",
      response.status,
      payload,
    );
  }

  if (typeof payload === "object" && payload && "data" in payload) {
    const wrapped = payload as ApiResponse<T>;
    if (wrapped.code !== 200 && wrapped.code !== 0) {
      throw new ApiError(wrapped.message || "API request failed", wrapped.code);
    }
    return wrapped.data as T;
  }

  return payload as T;
}

export const apiClient = {
  get: <T>(endpoint: string, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: "GET" }),
  post: <T>(endpoint: string, body?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: "POST", body }),
  patch: <T>(endpoint: string, body?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: "PATCH", body }),
  put: <T>(endpoint: string, body?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: "PUT", body }),
  delete: <T>(endpoint: string, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: "DELETE" }),
};
