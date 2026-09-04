/**
 * Self-hosted teacher accounts (draw.kuxuewuli.top parity).
 * Backed by excalidraw-storage /api/v2/auth/* (register/login/logout/me);
 * sessions are Bearer tokens kept in localStorage so students opening an
 * invite link stay anonymous while the teacher can create classrooms.
 */
import { atom } from "jotai";

const AUTH_TOKEN_STORAGE_KEY = "kuxue-auth-token";
const AUTH_EMAIL_STORAGE_KEY = "kuxue-auth-email";

export const AUTH_BASE = `${import.meta.env.VITE_APP_BACKEND_V2_GET_URL}auth`;

export const getAuthToken = () => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
export const getAuthEmail = () => localStorage.getItem(AUTH_EMAIL_STORAGE_KEY);

// initial value mirrors localStorage; App validates it against the server on
// mount and clears the storage when the session expired
export const authEmailAtom = atom<string | null>(getAuthEmail());

const authHeaders = () => {
  const token = getAuthToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const authRequest = async <T extends Record<string, unknown>>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(`${AUTH_BASE}${path}`, {
      ...init,
      credentials: "same-origin",
      headers: { ...authHeaders(), ...(init?.headers || {}) },
    });
  } catch {
    throw new Error("网络异常，请稍后再试");
  }
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    // non-JSON response — data stays {}
  }
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : `请求失败 (${res.status})`,
    );
  }
  return data as T;
};

type AuthResponse = { ok?: boolean; token?: string; email?: string };

const storeSession = (data: AuthResponse) => {
  if (data.token) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, data.token);
  }
  if (data.email) {
    localStorage.setItem(AUTH_EMAIL_STORAGE_KEY, data.email);
  }
};

export const apiRegister = (email: string, password: string) =>
  authRequest<AuthResponse>("/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }).then((data) => {
    storeSession(data);
    return data;
  });

export const apiLogin = (email: string, password: string) =>
  authRequest<AuthResponse>("/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }).then((data) => {
    storeSession(data);
    return data;
  });

export const apiLogout = async () => {
  try {
    await authRequest("/logout", { method: "POST" });
  } catch {
    // ignore — clear locally regardless
  }
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(AUTH_EMAIL_STORAGE_KEY);
};

export type AccountInfo = { email: string; createdAt: number | null };

/** Returns the account info when a stored token is still valid, else null. */
export const apiMe = async (): Promise<AccountInfo | null> => {
  const token = getAuthToken();
  if (!token) {
    return null;
  }
  try {
    const data = await authRequest<{ email?: string; createdAt?: number }>(
      "/me",
    );
    return typeof data.email === "string"
      ? { email: data.email, createdAt: typeof data.createdAt === "number" ? data.createdAt : null }
      : null;
  } catch {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(AUTH_EMAIL_STORAGE_KEY);
    return null;
  }
};

/** Verifies the current password and switches to a new one. */
export const apiChangePassword = (
  currentPassword: string,
  newPassword: string,
) =>
  authRequest<AuthResponse>("/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });