import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { testWebdavConnection } from "@/services/webdav-sync";
import { normalizePersistedWebdavConfig } from "@/stores/use-config-store";

const webdavConfig = normalizePersistedWebdavConfig({
    proxyMode: "nextjs",
    url: "https://dav.example.com/root",
    username: "demo",
    password: "secret",
    directory: "infinite-canvas",
});

describe("webdav sync", () => {
    beforeEach(() => {
        vi.stubGlobal("window", globalThis);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("uses direct WebDAV requests after normalizing an old nextjs proxy mode", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(new Response(null, { status: 405 }))
            .mockResolvedValueOnce(new Response(null, { status: 207 }))
            .mockResolvedValueOnce(new Response(null, { status: 207 }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(testWebdavConnection(webdavConfig)).resolves.toBeUndefined();

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock).toHaveBeenNthCalledWith(1, "https://dav.example.com/root/infinite-canvas", expect.objectContaining({ method: "MKCOL" }));
        expect(fetchMock).toHaveBeenNthCalledWith(3, "https://dav.example.com/root/infinite-canvas", expect.objectContaining({ method: "PROPFIND" }));
    });
});
