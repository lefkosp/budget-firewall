const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface ApiError {
  error: string;
  errors?: Array<{ msg: string; param: string }>;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

/** Thrown when a request 401s and the follow-up refresh attempt also fails. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
    this.name = "SessionExpiredError";
  }
}

type SessionExpiredHandler = () => void;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)bf_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

class ApiClient {
  private sessionExpiredHandlers: SessionExpiredHandler[] = [];
  private refreshPromise: Promise<boolean> | null = null;

  /** Registers a callback for when a session can no longer be refreshed. Returns an unsubscribe function. */
  onSessionExpired(handler: SessionExpiredHandler): () => void {
    this.sessionExpiredHandlers.push(handler);
    return () => {
      this.sessionExpiredHandlers = this.sessionExpiredHandlers.filter((h) => h !== handler);
    };
  }

  private notifySessionExpired(): void {
    for (const handler of this.sessionExpiredHandlers) handler();
  }

  // Auth cookies are httpOnly and managed entirely by the backend via
  // Set-Cookie -- coalesce concurrent 401s into a single refresh call.
  private refreshSession(): Promise<boolean> {
    if (!this.refreshPromise) {
      this.refreshPromise = fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": readCsrfCookie() || "" },
      })
        .then((res) => res.ok)
        .catch(() => false)
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, isRetry = false): Promise<T> {
    const isFormData = options.body instanceof FormData;
    const headers: Record<string, string> = {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers as Record<string, string>),
    };

    const method = (options.method || "GET").toUpperCase();
    if (MUTATING_METHODS.has(method)) {
      const csrfToken = readCsrfCookie();
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: "include",
    });

    if (response.status === 401 && !isRetry && endpoint !== "/api/auth/refresh") {
      const refreshed = await this.refreshSession();
      if (refreshed) {
        return this.request<T>(endpoint, options, true);
      }
      this.notifySessionExpired();
      throw new SessionExpiredError();
    }

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: "An error occurred",
      }));
      throw new Error(error.error || "Request failed");
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  async post<T>(endpoint: string, data?: FormData | Record<string, unknown>): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data instanceof FormData ? data : JSON.stringify(data),
    });
  }

  async put<T>(endpoint: string, data?: Record<string, unknown>): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async patch<T>(endpoint: string, data?: Record<string, unknown>): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }

  // Auth methods
  async login(email: string, password: string): Promise<{ user: AuthUser }> {
    return this.post<{ user: AuthUser }>("/api/auth/login", { email, password });
  }

  async register(email: string, password: string, name?: string): Promise<{ user: AuthUser }> {
    return this.post<{ user: AuthUser }>("/api/auth/register", { email, password, name });
  }

  async logout(): Promise<void> {
    await this.post("/api/auth/logout");
  }
}

export const api = new ApiClient();
