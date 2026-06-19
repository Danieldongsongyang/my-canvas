export const AUTH_TOKEN_KEY = "infinite-canvas-auth-session-v2";

export type UserRole = "guest" | "user" | "admin";

export type AuthUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    role: UserRole;
    credits: number;
    status?: number;
    group?: string;
    createdAt?: string;
    updatedAt?: string;
};

export type AuthSession = {
    user: AuthUser;
};

export type CanvasRelayToken = {
    token_id: number;
    token_name: string;
    relay_ready: boolean;
    relay_proxy_prefix: string;
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

type MangeUser = {
    id: number | string;
    username: string;
    display_name?: string;
    avatar_url?: string;
    role: number | string;
    status?: number;
    group?: string;
    quota?: number;
    created_at?: string;
    updated_at?: string;
};

export async function login(payload: AuthPayload) {
    const user = await mangeRequest<MangeUser>("/api/user/login", { method: "POST", body: JSON.stringify(payload) });
    return { user: normalizeMangeUser(user) };
}

export async function logout(userId?: string | number) {
    await mangeRequest<boolean>("/api/user/logout", { method: "GET" }, userId);
}

export async function fetchCurrentUser(userId?: string | number) {
    const user = await mangeRequest<MangeUser>("/api/user/self", { method: "GET" }, userId);
    return normalizeMangeUser(user);
}

export async function fetchMangeUserModels(userId?: string | number) {
    const models = await mangeRequest<string[]>("/api/user/models", { method: "GET" }, userId);
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
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
    if (!response.ok || payload.success === false || !payload.data?.relay_ready) {
        throw new Error(payload.message || "Relay API Key 初始化失败");
    }
    return payload.data;
}

export function userAuthHeaders(userId?: string | number) {
    return userId ? { "New-Api-User": String(userId) } : {};
}

async function mangeRequest<T>(url: string, init: RequestInit, userId?: string | number) {
    let response: Response;
    try {
        response = await fetch(url, {
            ...init,
            credentials: "include",
            headers: {
                ...(init.body ? { "Content-Type": "application/json" } : {}),
                ...userAuthHeaders(userId),
                ...init.headers,
            },
        });
    } catch {
        throw new Error("接口连接失败，请确认后端服务已启动");
    }

    const payload = (await response.json().catch(() => null)) as MangeApiResponse<T> | null;
    if (!payload || typeof payload !== "object") {
        throw new Error(response.status === 404 ? "接口不存在，请确认后端服务已启动" : "接口返回异常，请稍后重试");
    }
    if (!response.ok || payload.success === false) {
        throw new Error(payload.message || "请求失败");
    }
    return payload.data as T;
}

function normalizeMangeUser(user: MangeUser): AuthUser {
    return {
        id: String(user.id),
        username: user.username,
        displayName: user.display_name || user.username,
        avatarUrl: user.avatar_url || "",
        role: normalizeRole(user.role),
        credits: Number(user.quota || 0),
        status: user.status,
        group: user.group,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
    };
}

function normalizeRole(role: number | string): UserRole {
    if (role === "admin" || role === "root" || Number(role) >= 10) return "admin";
    if (role === "guest" || Number(role) === 0) return "guest";
    return "user";
}
