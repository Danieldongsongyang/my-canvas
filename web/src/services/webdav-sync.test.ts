import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { testWebdavConnection } from "@/services/webdav-sync";
import type { WebdavSyncConfig } from "@/stores/use-config-store";

const defaultConfig: WebdavSyncConfig = {
    proxyMode: "nextjs",
    url: "https://dav.example.com/root",
    username: "demo",
    password: "secret",
    directory: "infinite-canvas",
    lastSyncedAt: "",
};

describe("webdav sync", () => {
    beforeEach(() => {
        vi.stubGlobal("window", globalThis);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("uses direct WebDAV requests even when old nextjs proxy mode is present", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 405 }))
            .mockResolvedValueOnce(new Response(null, { status: 207 }))
            .mockResolvedValueOnce(new Response(null, { status: 207 }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(testWebdavConnection(defaultConfig)).resolves.toBeUndefined();

        expect(fetchMock).toHaveBeenCalledTimes(3);
        const [mkcolUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
        const [propfindUrl, propfindInit] = fetchMock.mock.calls[2] as [string, RequestInit];
        expect(mkcolUrl).toBe("https://dav.example.com/root/infinite-canvas");
        expect(propfindUrl).toBe("https://dav.example.com/root/infinite-canvas");
        expect(propfindInit.method).toBe("PROPFIND");
    });
});
