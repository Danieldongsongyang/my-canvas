import { apiGet, apiPost } from "@/services/api/request";

export const AUTH_TOKEN_KEY = "infinite-canvas-auth-token-v1";

export type UserRole = "guest" | "user" | "admin";

export type AuthUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    role: UserRole;
    credits: number;
    createdAt: string;
    updatedAt: string;
};

export type AuthSession = {
    token: string;
    user: AuthUser;
    relayApiKey?: string;
};

export type CanvasRelayToken = {
    token_id: number;
    token_name: string;
    api_key: string;
    relay_path_prefix: string;
};

type MangeApiResponse<T> = {
    success?: boolean;
    message?: string;
    data?: T;
};

export type AuthPayload = {
    username: string;
    password: string;
};

export async function login(payload: AuthPayload) {
    return apiPost<AuthSession>("/api/auth/login", payload);
}

export async function register(payload: AuthPayload) {
    return apiPost<AuthSession>("/api/auth/register", payload);
}

export async function fetchCurrentUser(token?: string) {
    return apiGet<AuthUser>("/api/auth/me", undefined, token);
}

export async function ensureCanvasRelayToken(userId?: string | number) {
    const response = await fetch("/api/canvas/relay-token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(userId ? { "New-Api-User": String(userId) } : {}),
        },
        credentials: "include",
        body: "{}",
    });
    const payload = (await response.json()) as MangeApiResponse<CanvasRelayToken>;
    if (!response.ok || payload.success === false || !payload.data?.api_key) {
        throw new Error(payload.message || "Relay API Key 初始化失败");
    }
    return payload.data;
}
