import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = {
    params: Promise<{ path: string[] }>;
};

const allowedUserRoutes: Record<string, string> = {
    "user/login": "POST",
    "user/logout": "GET",
    "user/self": "GET",
    "user/models": "GET",
};

const allowedRelayPostRoutes = new Set(["chat/completions", "images/generations", "images/edits", "audio/speech", "videos"]);

const PROXY_ERROR_MESSAGE = "接口连接失败，请确认 mange-backend 服务是否启动";
const UNSUPPORTED_API_MESSAGE = "该接口不在桌面端同源适配层白名单中，请使用 mange-backend 网页端或本地数据来源";

function proxyHeaders(request: NextRequest) {
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("content-length");
    headers.delete("connection");
    headers.set("x-forwarded-host", request.nextUrl.host);
    headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));
    return headers;
}

function responseHeaders(response: Response) {
    const headers = new Headers(response.headers);
    const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
    if (setCookies?.length) {
        headers.delete("set-cookie");
        setCookies.forEach((cookie) => headers.append("set-cookie", cookie));
    }
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.delete("transfer-encoding");
    return headers;
}

function jsonError(message: string, status: number) {
    return Response.json({ success: false, code: status, data: null, message, msg: message }, { status });
}

function isAllowedRelayVideoGet(path: string[]) {
    return path[2] === "videos" && (path.length === 4 || (path.length === 5 && path[4] === "content"));
}

function canProxy(path: string[], method: string) {
    const apiPath = path.join("/");
    if (allowedUserRoutes[apiPath]) return allowedUserRoutes[apiPath] === method;
    if (apiPath === "canvas/relay-token") return method === "POST";
    if (path[0] !== "canvas" || path[1] !== "relay") return false;
    const relayPath = path.slice(2).join("/");
    if (method === "POST") return allowedRelayPostRoutes.has(relayPath);
    if (method === "GET") return isAllowedRelayVideoGet(path);
    return false;
}

async function proxy(request: NextRequest, context: RouteContext) {
    const { path } = await context.params;
    if (!canProxy(path, request.method)) return jsonError(UNSUPPORTED_API_MESSAGE, 404);

    const mangeBackendBaseUrl = process.env.MANGE_BACKEND_API_URL || process.env.API_BASE_URL || "http://localhost:3000";
    const encodedPath = path.map(encodeURIComponent).join("/");
    const target = `${mangeBackendBaseUrl.replace(/\/$/, "")}/api/${encodedPath}${request.nextUrl.search}`;
    const hasBody = request.method !== "GET" && request.method !== "HEAD";

    try {
        const response = await fetch(target, {
            method: request.method,
            headers: proxyHeaders(request),
            body: hasBody ? request.body : undefined,
            duplex: hasBody ? "half" : undefined,
            redirect: "manual",
        } as RequestInit & { duplex?: "half" });

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders(response),
        });
    } catch (error) {
        console.error("Failed to proxy", target, error);
        return jsonError(PROXY_ERROR_MESSAGE, 502);
    }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
