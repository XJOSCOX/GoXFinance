export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const isWrite = options?.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase())
  const response = await fetch(`/api/${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: isWrite ? { ...(options?.body ? { 'Content-Type': 'application/json' } : {}), 'X-GoXFinance-Request': '1' } : undefined,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? 'Unable to complete the request')
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to complete the request'
}
