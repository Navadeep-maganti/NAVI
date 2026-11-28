import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { apiClient, TOKEN_STORAGE_KEY } from "../config/api";

const USER_STORAGE_KEY = "navi_user";
const ONBOARDING_KEY = "navi_onboarding_done";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isHydrated: boolean;
  onboardingCompleted: boolean;
  isLoading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  completeOnboarding: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isHydrated: false,
  onboardingCompleted: false,
  isLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  hydrate: async () => {
    try {
      const [token, rawUser, onboardingDone] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_STORAGE_KEY),
        AsyncStorage.getItem(USER_STORAGE_KEY),
        AsyncStorage.getItem(ONBOARDING_KEY),
      ]);
      const user = rawUser ? (JSON.parse(rawUser) as AuthUser) : null;
      set({
        token: token || null,
        user,
        onboardingCompleted: onboardingDone === "true",
        isHydrated: true,
      });
    } catch {
      set({ token: null, user: null, onboardingCompleted: false, isHydrated: true });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await apiClient.post("/api/auth/login", { email: email.trim(), password });
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, data.token);
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      const onboardingDone = await AsyncStorage.getItem(ONBOARDING_KEY);
      set({
        token: data.token,
        user: data.user,
        onboardingCompleted: onboardingDone === "true",
        isLoading: false,
      });
      return true;
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Login failed. Check your credentials and server connection.";
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  register: async (name, email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await apiClient.post("/api/auth/register", {
        name: name.trim(),
        email: email.trim(),
        password,
      });
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, data.token);
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      await AsyncStorage.setItem(ONBOARDING_KEY, "false");
      set({
        token: data.token,
        user: data.user,
        onboardingCompleted: false,
        isLoading: false,
      });
      return true;
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Registration failed. Please try again.";
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  completeOnboarding: async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    set({ onboardingCompleted: true });
  },

  logout: async () => {
    try {
      await apiClient.delete("/api/auth/device-token");
    } catch {
      // Best-effort cleanup if offline.
    }
    await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
    set({ token: null, user: null, error: null });
  },
}));
