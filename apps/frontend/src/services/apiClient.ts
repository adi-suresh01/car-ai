import { API_BASE_URL, DEFAULT_REQUEST_TIMEOUT_MS } from "../constants/network";

interface ApiRequestOptions {
  timeoutMs?: number;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS;
  }

  private resolveUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`);

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  }

  async post<TResponse>(path: string, body?: unknown): Promise<TResponse> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Request failed with status ${response.status}${errorText ? `: ${errorText}` : ""}`,
      );
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return (await response.json()) as TResponse;
  }
}

export const apiClient = new ApiClient();
