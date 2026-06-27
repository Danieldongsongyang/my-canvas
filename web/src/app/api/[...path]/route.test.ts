import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

const APP_URL = "http://localhost:3002";
const BACKEND_API_URL = "http://127.0.0.1:9000";
const UNSUPPORTED_API_MESSAGE = "该接口不在桌面端同源适配层白名单中，请使用 mange-backend 网页端或本地数据来源";
const PROXY_ERROR_MESSAGE = "接口连接失败，请确认 mange-backend 服务是否启动";

type ProxyRequest = Parameters<typeof GET>[0];
type RouteContext = Parameters<typeof GET>[1];
type TestRequestInit = {
    method?: string;
    headers?: HeadersInit;
    body?: BodyInit | null;
};
type ProxiedFetchCall = [string, RequestInit & { duplex?: string }];

function createContext(path: string[]): RouteContext {
    return {
        params: Promise.resolve({ path }),
    };
}

function createRequest(url: string, init?: TestRequestInit): ProxyRequest {
    const request = {
        method: init?.method || "GET",
        headers: new Headers(init?.headers),
        body: init?.body,
        nextUrl: new URL(url),
    };

    return request as ProxyRequest;
}

function stubFetchResponse(response: Response) {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function expectSingleFetchCall(fetchMock: ReturnType<typeof vi.fn>): ProxiedFetchCall {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    return fetchMock.mock.calls[0] as ProxiedFetchCall;
}

describe("api proxy route", () => {
    const originalEnv = process.env.MANGE_BACKEND_API_URL;

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        if (originalEnv === undefined) {
            delete process.env.MANGE_BACKEND_API_URL;
            return;
        }
        process.env.MANGE_BACKEND_API_URL = originalEnv;
    });

    it("rejects unsupported legacy endpoints", async () => {
        const response = await GET(createRequest(`${APP_URL}/api/settings`), createContext(["settings"]));

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toMatchObject({
            success: false,
            message: UNSUPPORTED_API_MESSAGE,
        });
    });

    it("rejects legacy prompts and assets api endpoints", async () => {
        const promptsResponse = await GET(createRequest(`${APP_URL}/api/prompts`), createContext(["prompts"]));
        const assetsResponse = await GET(createRequest(`${APP_URL}/api/assets`), createContext(["assets"]));

        expect(promptsResponse.status).toBe(404);
        await expect(promptsResponse.json()).resolves.toMatchObject({
            success: false,
            message: UNSUPPORTED_API_MESSAGE,
        });

        expect(assetsResponse.status).toBe(404);
        await expect(assetsResponse.json()).resolves.toMatchObject({
            success: false,
            message: UNSUPPORTED_API_MESSAGE,
        });
    });

    it("rejects legacy admin api endpoints", async () => {
        const response = await GET(createRequest(`${APP_URL}/api/admin/users`), createContext(["admin", "users"]));

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toMatchObject({
            success: false,
            message: UNSUPPORTED_API_MESSAGE,
        });
    });

    it("proxies mange auth endpoints with cookies and forwarded headers", async () => {
        process.env.MANGE_BACKEND_API_URL = BACKEND_API_URL;
        const fetchMock = stubFetchResponse(
            new Response(JSON.stringify({ success: true, code: 0, data: { id: 1 } }), {
                status: 200,
                headers: [
                    ["content-type", "application/json"],
                    ["set-cookie", "session=abc; Path=/; HttpOnly"],
                ],
            }),
        );

        const response = await POST(
            createRequest(`${APP_URL}/api/user/login?redirect=%2Fcanvas`, {
                method: "POST",
                headers: {
                    cookie: "session=old",
                    "content-type": "application/json",
                },
                body: JSON.stringify({ username: "demo", password: "secret" }),
            }),
            createContext(["user", "login"]),
        );

        const [target, init] = expectSingleFetchCall(fetchMock);
        expect(target).toBe(`${BACKEND_API_URL}/api/user/login?redirect=%2Fcanvas`);
        expect(init.method).toBe("POST");
        expect(init.body).toBeDefined();
        expect(init.duplex).toBe("half");
        expect((init.headers as Headers).get("cookie")).toBe("session=old");
        expect((init.headers as Headers).get("x-forwarded-host")).toBe("localhost:3002");
        expect((init.headers as Headers).get("x-forwarded-proto")).toBe("http");

        expect(response.status).toBe(200);
        expect(response.headers.get("set-cookie")).toContain("session=abc");
        await expect(response.json()).resolves.toMatchObject({ success: true, data: { id: 1 } });
    });

    it("proxies canvas relay requests with New-Api-User and preserves binary responses", async () => {
        process.env.MANGE_BACKEND_API_URL = BACKEND_API_URL;
        const binaryBody = new Uint8Array([1, 2, 3, 4]);
        const fetchMock = stubFetchResponse(
            new Response(binaryBody, {
                status: 200,
                headers: {
                    "content-type": "video/mp4",
                    "content-disposition": 'inline; filename="clip.mp4"',
                },
            }),
        );

        const response = await GET(
            createRequest(`${APP_URL}/api/canvas/relay/videos/task-1/content`, {
                headers: {
                    "New-Api-User": "42",
                },
            }),
            createContext(["canvas", "relay", "videos", "task-1", "content"]),
        );

        const [target, init] = expectSingleFetchCall(fetchMock);
        expect(target).toBe(`${BACKEND_API_URL}/api/canvas/relay/videos/task-1/content`);
        expect((init.headers as Headers).get("New-Api-User")).toBe("42");

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("video/mp4");
        expect(response.headers.get("content-disposition")).toContain("clip.mp4");
        await expect(response.arrayBuffer()).resolves.toEqual(binaryBody.buffer);
    });

    it("returns a Chinese error when mange-backend is unreachable", async () => {
        process.env.MANGE_BACKEND_API_URL = BACKEND_API_URL;
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));

        const response = await POST(
            createRequest(`${APP_URL}/api/canvas/relay-token`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}",
            }),
            createContext(["canvas", "relay-token"]),
        );

        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toMatchObject({
            success: false,
            message: PROXY_ERROR_MESSAGE,
        });
    });
});
