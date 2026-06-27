"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { AUTH_SESSION_KEY, ensureCanvasRelayToken, fetchCurrentUser, login, logout, toPersistedAuthUser, type AuthPayload, type AuthUser } from "@/services/api/auth";

type UserStore = {
    relayReady: boolean;
    user: AuthUser | null;
    isReady: boolean;
    isLoading: boolean;
    clearSession: () => void;
    hydrateUser: () => Promise<AuthUser | null>;
    login: (payload: AuthPayload) => Promise<AuthUser>;
};

async function initRelay(userId: string | number) {
    try {
        return (await ensureCanvasRelayToken(userId)).relay_ready === true;
    } catch {
        return false;
    }
}

async function requireRelayReady(userId: string | number) {
    try {
        if ((await ensureCanvasRelayToken(userId)).relay_ready === true) return true;
    } catch {
        throw new Error("登录成功，但初始化 AI Key 失败，请稍后重试或联系管理员");
    }
    throw new Error("登录成功，但初始化 AI Key 失败，请稍后重试或联系管理员");
}

function resetUserState() {
    return { relayReady: false, user: null, isReady: true, isLoading: false } as const;
}

export const useUserStore = create<UserStore>()(
    persist(
        (set, get) => ({
            relayReady: false,
            user: null,
            isReady: false,
            isLoading: false,
            clearSession: () => {
                const userId = get().user?.id;
                set(resetUserState());
                void logout(userId);
            },
            hydrateUser: async () => {
                const userId = get().user?.id;
                if (!userId) {
                    set(resetUserState());
                    return null;
                }
                set({ isLoading: true });
                try {
                    const user = await fetchCurrentUser(userId);
                    if (user.role === "guest") {
                        set(resetUserState());
                        return null;
                    }
                    const relayReady = get().relayReady || (await initRelay(user.id));
                    set({ user, relayReady, isReady: true, isLoading: false });
                    return user;
                } catch {
                    set(resetUserState());
                    return null;
                }
            },
            login: async (payload) => {
                set({ relayReady: false, isLoading: true });
                try {
                    const session = await login(payload);
                    if (session.user.role === "guest") throw new Error("游客账号暂不支持桌面端登录，请使用正式账号登录");
                    const relayReady = await requireRelayReady(session.user.id);
                    set({ relayReady, user: session.user, isReady: true, isLoading: false });
                    return session.user;
                } catch (error) {
                    set(resetUserState());
                    throw error;
                }
            },
        }),
        {
            name: AUTH_SESSION_KEY,
            partialize: (state) => ({ user: toPersistedAuthUser(state.user), relayReady: state.relayReady }),
            onRehydrateStorage: () => (state) => {
                if (state) {
                    state.isReady = false;
                    state.isLoading = false;
                }
            },
        },
    ),
);
