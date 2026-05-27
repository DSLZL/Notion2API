import { API_BASE } from './env'
import { ApiError, AuthError } from './errors'

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, headers: customHeaders, ...rest } = opts

  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    ...(customHeaders as Record<string, string>),
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest,
  })

  if (res.status === 401) {
    window.location.hash = '#/login'
    throw new AuthError()
  }

  if (!res.ok) {
    let message = res.statusText
    try {
      const err = await res.json()
      message = err.message || err.error || message
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status)
  }

  if (res.status === 204) {
    return undefined as T
  }

  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}
