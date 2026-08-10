const BASE_URL = '/api/v1';

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  if (!response.ok) {
    let body: unknown;
    try { body = await response.json(); } catch { body = null; }
    const error = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    throw new ApiError(
      typeof error.detail === 'string' ? error.detail : '请求失败，请稍后重试',
      typeof error.code === 'string' ? error.code : 'HTTP_ERROR',
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function jsonRequest<T>(path: string, init: Omit<RequestInit, 'body'> & { body?: unknown } = {}) {
  const { body, headers, ...rest } = init;
  return request<T>(path, { ...rest, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}

export function multipartRequest<T>(path: string, formData: FormData) {
  return request<T>(path, { method: 'POST', body: formData });
}

export function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined) search.set(key, String(value)); });
  return search.size ? `?${search}` : '';
}
