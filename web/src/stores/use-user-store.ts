"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { AUTH_TOKEN_KEY, ensureCanvasRelayToken, fetchCurrentUser, login, register, type AuthPayload, type AuthUser } from "@/services/api/auth";

type UserStore = {
    token: string;
    relayApiKey: string;
    user: AuthUser | null;
    isReady: boolean;
    isLoading: boolean;
    setSession: (token: string, user: AuthUser, relayApiKey?: string) => void;
    setRelayApiKey: (relayApiKey: string) => void;
    clearSession: () => void;
    hydrateUser: () => Promise<void>;
    login: (payload: AuthPayload) => Promise<AuthUser>;
    register: (payload: AuthPayload) => Promise<AuthUser>;
};

async function initRelayApiKey(userId?: string | number) {
    try {
        return (await ensureCanvasRelayToken(userId)).api_key || "";
    } catch {
        return "";
    }
}

export const useUserStore = create<UserStore>()(
    persist(
        (set, get) => ({
            token: "",
            relayApiKey: "",
            user: null,
            isReady: false,
            isLoading: false,
            setSession: (token, user, relayApiKey) => set((state) => ({ token, user, relayApiKey: relayApiKey ?? state.relayApiKey, isReady: true })),
            setRelayApiKey: (relayApiKey) => set({ relayApiKey }),
            clearSession: () => set({ token: "", relayApiKey: "", user: null, isReady: true }),
            hydrateUser: async () => {
                const token = get().token;
                if (!token) {
                    set({ user: null, relayApiKey: "", isReady: true });
                    return;
                }
                set({ isLoading: true });
                try {
                    const user = await fetchCurrentUser(token);
                    if (user.role === "guest") {
                        set({ token: "", relayApiKey: "", user: null, isReady: true, isLoading: false });
                        return;
                    }
                    const relayApiKey = get().relayApiKey || (await initRelayApiKey(user.id));
                    set({ user, relayApiKey, isReady: true, isLoading: false });
                } catch {
                    set({ token: "", relayApiKey: "", user: null, isReady: true, isLoading: false });
                }
            },
            login: async (payload) => {
                set({ isLoading: true });
                try {
                    const session = await login(payload);
                    const relayApiKey = session.relayApiKey || (await initRelayApiKey(session.user.id));
                    set({ token: session.token, relayApiKey, user: session.user, isReady: true, isLoading: false });
                    return session.user;
                } catch (error) {
                    set({ isLoading: false });
                    throw error;
                }
            },
            register: async (payload) => {
                set({ isLoading: true });
                try {
                    const session = await register(payload);
                    const relayApiKey = session.relayApiKey || (await initRelayApiKey(session.user.id));
                    set({ token: session.token, relayApiKey, user: session.user, isReady: true, isLoading: false });
                    return session.user;
                } catch (error) {
                    set({ isLoading: false });
                    throw error;
                }
            },
        }),
        {
            name: AUTH_TOKEN_KEY,
            partialize: (state) => ({ token: state.token, relayApiKey: state.relayApiKey }),
            onRehydrateStorage: () => (state) => {
                if (state) state.isReady = false;
            },
        },
    ),
);
