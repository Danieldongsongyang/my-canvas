import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthUser, PersistedAuthUser } from "@/services/api/auth";

const authMocks = vi.hoisted(() => {
    const storage = new Map<string, string>();
    const localStorageMock: Storage = {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
            storage.set(key, value);
        },
        removeItem: (key: string) => {
            storage.delete(key);
        },
        clear: () => {
            storage.clear();
        },
        key: (index: number) => Array.from(storage.keys())[index] ?? null,
        get length() {
            return storage.size;
        },
    };
    const toPersistedAuthUser = (user: AuthUser | PersistedAuthUser | null): PersistedAuthUser | null => {
        if (!user) return null;
        return {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            role: user.role,
        };
    };

    vi.stubGlobal("localStorage", localStorageMock);
    vi.stubGlobal("window", { localStorage: localStorageMock });

    return {
        storage,
        ensureCanvasRelayToken: vi.fn(),
        fetchCurrentUser: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        toPersistedAuthUser,
    };
});

vi.mock("@/services/api/auth", () => ({
    AUTH_SESSION_KEY: "infinite-canvas-auth-session-v4",
    ensureCanvasRelayToken: authMocks.ensureCanvasRelayToken,
    fetchCurrentUser: authMocks.fetchCurrentUser,
    login: authMocks.login,
    logout: authMocks.logout,
    toPersistedAuthUser: authMocks.toPersistedAuthUser,
}));

import { useUserStore } from "@/stores/use-user-store";

function createAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
    return {
        id: "42",
        username: "demo",
        displayName: "演示用户",
        avatarUrl: "",
        role: "user",
        credits: 0,
        ...overrides,
    };
}

describe("useUserStore", () => {
    beforeEach(() => {
        authMocks.storage.clear();
        vi.clearAllMocks();
        useUserStore.setState({
            relayReady: false,
            user: null,
            isReady: false,
            isLoading: false,
        });
    });

    it("clears local user summary and relay state when cookie restore fails", async () => {
        useUserStore.setState({
            relayReady: true,
            user: createAuthUser(),
        });
        authMocks.fetchCurrentUser.mockRejectedValue(new Error("未登录"));

        await expect(useUserStore.getState().hydrateUser()).resolves.toBeNull();
        expect(useUserStore.getState()).toMatchObject({
            relayReady: false,
            user: null,
            isReady: true,
            isLoading: false,
        });
    });

    it("re-initializes relay when a restored user summary is valid but relay is not ready", async () => {
        useUserStore.setState({
            relayReady: false,
            user: createAuthUser(),
        });
        authMocks.fetchCurrentUser.mockResolvedValue(
            createAuthUser({
                avatarUrl: "https://example.com/avatar.png",
                credits: 88,
            }),
        );
        authMocks.ensureCanvasRelayToken.mockResolvedValue({ relay_ready: true });

        await expect(useUserStore.getState().hydrateUser()).resolves.toMatchObject({ id: "42" });
        expect(authMocks.fetchCurrentUser).toHaveBeenCalledWith("42");
        expect(authMocks.ensureCanvasRelayToken).toHaveBeenCalledWith("42");
        expect(useUserStore.getState()).toMatchObject({
            relayReady: true,
            isReady: true,
            isLoading: false,
            user: {
                id: "42",
                credits: 88,
            },
        });
    });

    it("waits for relay ready before completing username-password login", async () => {
        authMocks.login.mockResolvedValue({
            user: createAuthUser(),
        });
        authMocks.ensureCanvasRelayToken.mockResolvedValue({ relay_ready: true });

        await expect(useUserStore.getState().login({ username: "demo", password: "secret" })).resolves.toMatchObject({ id: "42" });
        expect(authMocks.ensureCanvasRelayToken).toHaveBeenCalledWith("42");
        expect(useUserStore.getState()).toMatchObject({
            relayReady: true,
            isReady: true,
            isLoading: false,
            user: {
                id: "42",
            },
        });
    });

    it("clears in-memory state first and logs out with the captured user id", () => {
        useUserStore.setState({
            relayReady: true,
            user: createAuthUser({
                avatarUrl: "https://example.com/avatar.png",
                role: "admin",
                credits: 88,
            }),
            isReady: true,
            isLoading: false,
        });

        useUserStore.getState().clearSession();

        expect(useUserStore.getState()).toMatchObject({
            relayReady: false,
            user: null,
            isReady: true,
            isLoading: false,
        });
        expect(authMocks.logout).toHaveBeenCalledWith("42");
    });
});
