"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { AUTH_TOKEN_KEY, ensureCanvasRelayToken, fetchCurrentUser, login, logout, type AuthPayload, type AuthUser } from "@/services/api/auth";

type UserStore = {
    token: string;
    relayReady: boolean;
    user: AuthUser | null;
    isReady: boolean;
    isLoading: boolean;
    setSession: (user: AuthUser, relayReady?: boolean) => void;
    clearSession: () => void;
    hydrateUser: () => Promise<void>;
    login: (payload: AuthPayload) => Promise<AuthUser>;
};

async function initRelay(userId?: string | number) {
    try {
        return (await ensureCanvasRelayToken(userId)).relay_ready === true;
    } catch {
        return false;
    }
}

export const useUserStore = create<UserStore>()(
    persist(
        (set, get) => ({
            token: "",
            relayReady: false,
            user: null,
            isReady: false,
            isLoading: false,
            setSession: (user, relayReady) => set((state) => ({ token: String(user.id), user, relayReady: relayReady ?? state.relayReady, isReady: true })),
            clearSession: () => {
                const userId = get().user?.id;
                set({ token: "", relayReady: false, user: null, isReady: true });
                void logout(userId);
            },
            hydrateUser: async () => {
                const userId = get().user?.id || get().token;
                if (!userId) {
                    set({ user: null, relayReady: false, isReady: true });
                    return;
                }
                set({ isLoading: true });
                try {
                    const user = await fetchCurrentUser(userId);
                    if (user.role === "guest") {
                        set({ token: "", relayReady: false, user: null, isReady: true, isLoading: false });
                        return;
                    }
                    const relayReady = get().relayReady || (await initRelay(user.id));
                    set({ token: String(user.id), user, relayReady, isReady: true, isLoading: false });
                } catch {
                    set({ token: "", relayReady: false, user: null, isReady: true, isLoading: false });
                }
            },
            login: async (payload) => {
                set({ isLoading: true });
                try {
                    const session = await login(payload);
                    const relayReady = await initRelay(session.user.id);
                    set({ token: String(session.user.id), relayReady, user: session.user, isReady: true, isLoading: false });
                    return session.user;
                } catch (error) {
                    set({ isLoading: false });
                    throw error;
                }
            },
        }),
        {
            name: AUTH_TOKEN_KEY,
            partialize: (state) => ({ token: state.token, user: state.user, relayReady: state.relayReady }),
            onRehydrateStorage: () => (state) => {
                if (state) state.isReady = false;
            },
        },
    ),
);
