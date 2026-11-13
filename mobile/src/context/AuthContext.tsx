import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import * as Sharing from 'expo-sharing';
import { API_URL, ApiError, parseResponse, type Account } from '../lib/api';

const ACCESS_KEY = 'smartstock_access';
const REFRESH_KEY = 'smartstock_refresh';

type TokenPair = { access: string; refresh?: string };
type AuthContextValue = {
  user: Account | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<boolean>;
  apiGet: <T>(path: string) => Promise<T>;
  apiPost: <T>(path: string, data: unknown) => Promise<T>;
  apiPatch: <T>(path: string, data: unknown) => Promise<T>;
  apiDelete: <T>(path: string) => Promise<T>;
  apiUpload: <T>(path: string, formData: FormData) => Promise<T>;
  apiOpenPdf: (path: string, filename: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function clearSavedSession() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const accessRef = useRef<string | null>(null);
  const refreshRef = useRef<string | null>(null);
  const renewingRef = useRef<Promise<string> | null>(null);

  const renewAccess = useCallback(async (): Promise<string> => {
    if (renewingRef.current) return renewingRef.current;

    const task = (async () => {
      const refresh = refreshRef.current;
      if (!refresh || !API_URL) throw new ApiError('Session expired. Please sign in again.', 401);
      const response = await fetch(`${API_URL}/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
      const data = await parseResponse<TokenPair>(response);
      if (!data.access) throw new ApiError('Could not refresh session.', 401);
      await SecureStore.setItemAsync(ACCESS_KEY, data.access);
      accessRef.current = data.access;
      if (data.refresh) {
        await SecureStore.setItemAsync(REFRESH_KEY, data.refresh);
        refreshRef.current = data.refresh;
      }
      return data.access;
    })();

    renewingRef.current = task;
    try {
      return await task;
    } finally {
      renewingRef.current = null;
    }
  }, []);

  const requestAuthenticated = useCallback(async <T,>(
    path: string,
    options?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; data?: unknown; formData?: FormData },
  ): Promise<T> => {
    if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL is missing.');
    let access = accessRef.current;
    if (!access) throw new ApiError('Please sign in.', 401);

    const send = (token: string) => {
      const method = options?.method ?? 'GET';
      const hasJson = (method === 'POST' || method === 'PATCH') && !options?.formData;
      return fetch(`${API_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          // React Native sets the multipart boundary for FormData itself.
          ...(hasJson ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(options?.formData
          ? { body: options.formData }
          : hasJson ? { body: JSON.stringify(options?.data) } : {}),
      });
    };

    let response = await send(access);
    if (response.status === 401) {
      try {
        access = await renewAccess();
        response = await send(access);
      } catch (error) {
        accessRef.current = null;
        refreshRef.current = null;
        await clearSavedSession();
        setUser(null);
        throw error;
      }
    }
    if (response.status === 401) {
      accessRef.current = null;
      refreshRef.current = null;
      await clearSavedSession();
      setUser(null);
    }
    return parseResponse<T>(response);
  }, [renewAccess]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const access = await SecureStore.getItemAsync(ACCESS_KEY);
        const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
        accessRef.current = access;
        refreshRef.current = refresh;

        if (!access && !refresh) return;
        if (!access && refresh) await renewAccess();
        const profile = await requestAuthenticated<Account>('/auth/me/');
        if (mounted) setUser(profile);
      } catch {
        accessRef.current = null;
        refreshRef.current = null;
        try { await clearSavedSession(); } catch { /* storage might be inaccessible */ }
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [renewAccess, requestAuthenticated]);

  const signIn = useCallback(async (username: string, password: string) => {
    if (!API_URL) throw new Error('Mobile API URL is not configured.');
    const response = await fetch(`${API_URL}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    });
    const tokens = await parseResponse<TokenPair>(response);
    if (!tokens.access || !tokens.refresh) throw new Error('Login response has missing tokens.');

    // Verify identity before saving credentials.
    const meResponse = await fetch(`${API_URL}/auth/me/`, {
      headers: { Authorization: `Bearer ${tokens.access}` },
    });
    const profile = await parseResponse<Account>(meResponse);
    if (!profile.role) throw new Error('Account role is missing.');

    await SecureStore.setItemAsync(ACCESS_KEY, tokens.access);
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh);
    accessRef.current = tokens.access;
    refreshRef.current = tokens.refresh;
    setUser(profile);
  }, []);

  const signOut = useCallback(async (): Promise<boolean> => {
    let serverRevoked = false;
    const access = accessRef.current;
    const refresh = refreshRef.current;
    if (access && refresh && API_URL) {
      try {
        const response = await fetch(`${API_URL}/auth/logout/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access}`,
          },
          body: JSON.stringify({ refresh }),
        });
        serverRevoked = response.ok;
      } catch { /* local sign-out still required */ }
    }
    // If secure storage fails, don't claim the session was cleared.
    await clearSavedSession();
    accessRef.current = null;
    refreshRef.current = null;
    setUser(null);
    return serverRevoked;
  }, []);

  const apiPost = useCallback(<T,>(path: string, data: unknown): Promise<T> =>
    requestAuthenticated<T>(path, { method: 'POST', data }), [requestAuthenticated]);

  const apiPatch = useCallback(<T,>(path: string, data: unknown): Promise<T> =>
    requestAuthenticated<T>(path, { method: 'PATCH', data }), [requestAuthenticated]);

  const apiDelete = useCallback(<T,>(path: string): Promise<T> =>
    requestAuthenticated<T>(path, { method: 'DELETE' }), [requestAuthenticated]);

  const apiUpload = useCallback(<T,>(path: string, formData: FormData): Promise<T> =>
    requestAuthenticated<T>(path, { method: 'POST', formData }), [requestAuthenticated]);

  // PDF endpoints return binary, so they must not go through parseResponse(JSON).
  // Keep bearer tokens in memory and use the same access-token refresh logic.
  const apiOpenPdf = useCallback(async (path: string, filename: string): Promise<void> => {
    if (!API_URL) throw new Error('Mobile API URL is not configured.');
    if (!/^\/orders\/\d+\/invoice\/$/.test(path)) throw new Error('Invalid invoice path.');
    let token = accessRef.current;
    if (!token) throw new ApiError('Please sign in again.', 401);
    const download = (access: string) => expoFetch(`${API_URL}${path}`, {
      method: 'GET',
      // DRF negotiates its API renderer before returning the PDF HttpResponse.
      headers: { Authorization: `Bearer ${access}`, Accept: '*/*' },
    });
    let response = await download(token);
    if (response.status === 401) {
      try {
        token = await renewAccess();
        response = await download(token);
      } catch (error) {
        accessRef.current = null;
        refreshRef.current = null;
        await clearSavedSession();
        setUser(null);
        throw error;
      }
    }
    if (response.status === 401) {
      accessRef.current = null;
      refreshRef.current = null;
      await clearSavedSession();
      setUser(null);
    }
    if (!response.ok) {
      const raw = await response.text();
      let message = `Invoice request failed (HTTP ${response.status}).`;
      try {
        const error = JSON.parse(raw) as { detail?: string };
        if (typeof error.detail === 'string') message = error.detail;
      } catch { /* Non-JSON error responses also show HTTP code. */ }
      throw new ApiError(message, response.status);
    }
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/pdf')) {
      throw new Error('The server returned a non-PDF response.');
    }
    const bytes = await response.bytes();
    if (!bytes.length || bytes.length > 15 * 1024 * 1024) {
      throw new Error('The invoice PDF is empty or exceeds 15 MB.');
    }
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.pdf$/i, '').slice(0, 100) || 'invoice';
    const file = new File(Paths.cache, `${safeName}-${Date.now()}.pdf`);
    await file.write(bytes);
    try {
      await file.preview({ title: 'SmartStock Invoice' });
    } catch {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('PDF saved temporarily, but no PDF viewer or sharing app is available.');
      }
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'SmartStock Invoice' });
    }
  }, [renewAccess]);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, apiGet: requestAuthenticated, apiPost, apiPatch, apiDelete, apiUpload, apiOpenPdf }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
