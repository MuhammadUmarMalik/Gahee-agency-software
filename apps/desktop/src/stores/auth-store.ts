import { create } from "zustand";
import type { AuthUser, LoginInput, LoginResponse } from "@oil-agency/shared";
import { apiRequest } from "@/api/client";

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  expiresAt: string | null;
  login(input: LoginInput): Promise<void>;
  refreshCurrentUser(): Promise<void>;
  logout(): Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null, user: null, expiresAt: null,
  async login(input) { const result = await apiRequest<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify(input) }); set(result); },
  async refreshCurrentUser() {
    const { token, expiresAt } = get();
    if (!token || !expiresAt || new Date(expiresAt) <= new Date()) { set({ token: null, user: null, expiresAt: null }); return; }
    try { const result = await apiRequest<{ user: AuthUser }>("/auth/me", {}, token); set({ user: result.user }); }
    catch { set({ token: null, user: null, expiresAt: null }); }
  },
  async logout() { const token = get().token; set({ token: null, user: null, expiresAt: null }); if (token) await apiRequest<void>("/auth/logout", { method: "POST" }, token).catch(() => undefined); },
}));
