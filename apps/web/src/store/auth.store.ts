import { create } from 'zustand';
import { UserRole } from '@facturacion-ec/shared';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  branchId: string | null;
}

interface AuthState {
  /** Access token vive solo en memoria (no localStorage) */
  accessToken: string | null;
  user: AuthUser | null;
  setSession: (accessToken: string, user: AuthUser) => void;
  clearSession: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  setSession: (accessToken, user) => set({ accessToken, user }),
  clearSession: () => set({ accessToken: null, user: null }),
  isAuthenticated: () => !!get().accessToken,
}));
