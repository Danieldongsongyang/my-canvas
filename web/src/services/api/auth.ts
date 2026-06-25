export const AUTH_SESSION_KEY = "infinite-canvas-auth-session-v3";

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
    code?: number;
    message?: string;
    msg?: string;
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
    if (!response.ok || payload.success === false || (typeof payload.code === "number" && payload.code !== 0) || !payload.data?.relay_ready) {
        throw new Error(payload.message || payload.msg || "Relay API Key 初始化失败");
    }
    return payload.data;
}

export function userAuthHeaders(userId?: string | number) {
    return userId ? { "New-Api-User": String(userId) } : {};
}

async function mangeRequest<T>(url: string, init: RequestInit, userId?: string | number) {
    let response: Response;
    try {
        const headers = new Headers(init.headers);
        if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
        if (userId && !headers.has("New-Api-User")) headers.set("New-Api-User", String(userId));
        response = await fetch(url, {
            ...init,
            credentials: "include",
            headers,
        });
    } catch {
        throw new Error("接口连接失败，请确认 mange-backend 服务是否启动");
    }

    const payload = (await response.json().catch(() => null)) as MangeApiResponse<T> | null;
    if (!payload || typeof payload !== "object") {
        throw new Error(response.status === 404 ? "接口不存在，请确认 mange-backend 服务是否启动" : "接口返回异常，请稍后重试");
    }
    if (!response.ok || payload.success === false || (typeof payload.code === "number" && payload.code !== 0)) {
        throw new Error(readMangeErrorMessage(url, payload));
    }
    return payload.data as T;
}

function readMangeErrorMessage<T>(url: string, payload: MangeApiResponse<T>) {
    const message = payload.message || payload.msg || "请求失败";
    if (url !== "/api/user/login") return message;
    const lowerMessage = message.toLowerCase();
    if (/(2fa|mfa|totp|otp|two[- ]?factor|二次验证|两步验证|验证码)/i.test(lowerMessage)) {
        return "当前账号开启了二次验证，桌面端第一阶段暂不支持，请先在 mange-backend 网页端完成登录设置或改用用户名密码账号。";
    }
    if (/(oauth|passkey|webauthn|第三方|通行密钥)/i.test(lowerMessage)) {
        return "桌面端第一阶段暂不支持 OAuth 或 Passkey 登录，请在 mange-backend 网页端完成账号绑定后使用用户名密码登录。";
    }
    return message;
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
