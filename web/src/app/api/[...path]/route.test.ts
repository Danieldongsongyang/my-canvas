import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

type RouteContext = {
    params: Promise<{ path: string[] }>;
};

function createContext(path: string[]): RouteContext {
    return {
        params: Promise.resolve({ path }),
    };
}

function createRequest(url: string, init?: { method?: string; headers?: HeadersInit; body?: BodyInit | null }) {
    return {
        method: init?.method || "GET",
        headers: new Headers(init?.headers),
        body: init?.body,
        nextUrl: new URL(url),
    };
}

describe("api proxy route", () => {
    const originalEnv = process.env.MANGE_BACKEND_API_URL;

    afterEach(() => {
        vi.restoreAllMocks();
        if (originalEnv === undefined) {
            delete process.env.MANGE_BACKEND_API_URL;
            return;
        }
        process.env.MANGE_BACKEND_API_URL = originalEnv;
    });

    it("rejects unsupported legacy endpoints", async () => {
        const response = await GET(createRequest("http://localhost:3002/api/settings") as never, createContext(["settings"]));

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toMatchObject({
            success: false,
            message: "该接口不在桌面端同源适配层白名单中，请使用 mange-backend 网页端或本地数据来源",
        });
    });

    it("proxies mange auth endpoints with cookies and forwarded headers", async () => {
        process.env.MANGE_BACKEND_API_URL = "http://127.0.0.1:9000";
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ success: true, code: 0, data: { id: 1 } }), {
                status: 200,
                headers: [
                    ["content-type", "application/json"],
                    ["set-cookie", "session=abc; Path=/; HttpOnly"],
                ],
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await POST(
            createRequest("http://localhost:3002/api/user/login?redirect=%2Fcanvas", {
                method: "POST",
                headers: {
                    cookie: "session=old",
                    "content-type": "application/json",
                },
                body: JSON.stringify({ username: "demo", password: "secret" }),
            }) as never,
            createContext(["user", "login"]),
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit & { duplex?: string }];
        expect(target).toBe("http://127.0.0.1:9000/api/user/login?redirect=%2Fcanvas");
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
        process.env.MANGE_BACKEND_API_URL = "http://127.0.0.1:9000";
        const binaryBody = new Uint8Array([1, 2, 3, 4]);
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(binaryBody, {
                status: 200,
                headers: {
                    "content-type": "video/mp4",
                    "content-disposition": 'inline; filename="clip.mp4"',
                },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await GET(
            createRequest("http://localhost:3002/api/canvas/relay/videos/task-1/content", {
                headers: {
                    "New-Api-User": "42",
                },
            }) as never,
            createContext(["canvas", "relay", "videos", "task-1", "content"]),
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(target).toBe("http://127.0.0.1:9000/api/canvas/relay/videos/task-1/content");
        expect((init.headers as Headers).get("New-Api-User")).toBe("42");

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("video/mp4");
        expect(response.headers.get("content-disposition")).toContain("clip.mp4");
        await expect(response.arrayBuffer()).resolves.toEqual(binaryBody.buffer);
    });

    it("returns a Chinese error when mange-backend is unreachable", async () => {
        process.env.MANGE_BACKEND_API_URL = "http://127.0.0.1:9000";
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));

        const response = await POST(
            createRequest("http://localhost:3002/api/canvas/relay-token", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}",
            }) as never,
            createContext(["canvas", "relay-token"]),
        );

        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toMatchObject({
            success: false,
            message: "接口连接失败，请确认 mange-backend 服务是否启动",
        });
    });
});
