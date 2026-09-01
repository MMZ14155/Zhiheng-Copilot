import type { CurrentUser } from "./models";

const BASE_URL = "/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** 从未知异常中提取面向用户的错误文案。 */
export const errorMessage = (reason: unknown, fallback: string) =>
  reason instanceof ApiError ? reason.message : fallback;

// 登录会话仅保存在内存模块变量中（WebView 约束，不使用 localStorage 等持久化），刷新页面后需重新登录。
let authToken: string | null = null;
let authUser: CurrentUser | null = null;
const authListeners = new Set<() => void>();

const notifyAuthListeners = () => {
  authListeners.forEach((listener) => listener());
};

export function setAuthToken(
  token: string | null,
  user: CurrentUser | null = null,
) {
  authToken = token;
  authUser = token ? user : null;
  notifyAuthListeners();
}

export function setAuthUser(user: CurrentUser | null) {
  authUser = user;
  notifyAuthListeners();
}

export function getAuthToken() {
  return authToken;
}
export function getAuthUser() {
  return authUser;
}

export function subscribeAuth(listener: () => void) {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  parseResponse: (response: Response) => Promise<T> = (response) =>
    response.json() as Promise<T>,
  clearAuthOnUnauthorized = true,
): Promise<T> {
  const { headers, ...rest } = init;
  const mergedHeaders = {
    ...(headers as Record<string, string> | undefined),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: mergedHeaders,
  });
  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const error =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    // 401 一律视为令牌失效：清空内存令牌，由 App 守卫跳转登录页。
    if (response.status === 401 && clearAuthOnUnauthorized) setAuthToken(null);
    throw new ApiError(
      typeof error.detail === "string" ? error.detail : "请求失败，请稍后重试",
      typeof error.code === "string" ? error.code : "HTTP_ERROR",
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return parseResponse(response);
}

export function jsonRequest<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
  options: { clearAuthOnUnauthorized?: boolean } = {},
) {
  const { body, headers, ...rest } = init;
  return request<T>(
    path,
    {
      ...rest,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    undefined,
    options.clearAuthOnUnauthorized,
  );
}

export function multipartRequest<T>(path: string, formData: FormData) {
  return request<T>(path, { method: "POST", body: formData });
}

export function blobRequest(path: string, init: RequestInit = {}) {
  return request(path, init, async (response) => ({
    blob: await response.blob(),
    headers: response.headers,
  }));
}

export function textRequest(path: string, init: RequestInit = {}) {
  return request<{ text: string; headers: Headers }>(
    path,
    init,
    async (response) => ({ text: await response.text(), headers: response.headers }),
  );
}

export function queryString(
  params: Record<string, string | number | undefined>,
) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) search.set(key, String(value));
  });
  return search.size ? `?${search}` : "";
}
