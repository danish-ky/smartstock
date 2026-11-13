export const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');

export type Account = {
  id?: number;
  username?: string;
  full_name?: string;
  name?: string;
  email?: string;
  role: string;
};

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.text();
  let data: unknown;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    throw new ApiError('The server returned an unexpected response.', response.status);
  }
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'detail' in data && typeof data.detail === 'string'
        ? data.detail
        : `Request failed (HTTP ${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export function listItems<T>(payload: T[] | { results?: T[] } | null): T[] {
  if (Array.isArray(payload)) return payload;
  return payload && Array.isArray(payload.results) ? payload.results : [];
}
