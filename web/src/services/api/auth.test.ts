import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchCurrentUser, login, toPersistedAuthUser } from "@/services/api/auth";

describe("auth api", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("maps 2FA login responses to a clear desktop message", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ success: false, message: "当前账号需要 2FA 验证" }), {
                    status: 401,
                    headers: { "content-type": "application/json" },
                }),
            ),
        );

        await expect(login({ username: "demo", password: "secret" })).rejects.toThrow("当前账号开启了二次验证");
    });

    it("maps OAuth and Passkey login responses to a clear desktop message", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ success: false, message: "Please use passkey or oauth login" }), {
                    status: 401,
                    headers: { "content-type": "application/json" },
                }),
            ),
        );

        await expect(login({ username: "demo", password: "secret" })).rejects.toThrow("桌面端第一阶段暂不支持 OAuth 或 Passkey 登录");
    });

    it("uses cookie auth plus New-Api-User when restoring the current user", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    success: true,
                    code: 0,
                    data: {
                        id: 42,
                        username: "demo",
                        display_name: "演示用户",
                        avatar_url: "https://example.com/avatar.png",
                        role: 1,
                        quota: 88,
                    },
                }),
                {
                    status: 200,
                    headers: { "content-type": "application/json" },
                },
            ),
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchCurrentUser(42)).resolves.toMatchObject({
            id: "42",
            username: "demo",
            displayName: "演示用户",
            avatarUrl: "https://example.com/avatar.png",
            role: "user",
            credits: 88,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/user/self");
        expect(init.credentials).toBe("include");
        expect(new Headers(init.headers).get("New-Api-User")).toBe("42");
    });

    it("persists only the non-sensitive user summary", () => {
        expect(
            toPersistedAuthUser({
                id: "42",
                username: "demo",
                displayName: "演示用户",
                avatarUrl: "https://example.com/avatar.png",
                role: "admin",
                credits: 88,
                status: 1,
                group: "default",
                createdAt: "2026-06-27T00:00:00Z",
                updatedAt: "2026-06-27T00:00:00Z",
            }),
        ).toEqual({
            id: "42",
            username: "demo",
            displayName: "演示用户",
            avatarUrl: "https://example.com/avatar.png",
            role: "admin",
        });
    });
});
