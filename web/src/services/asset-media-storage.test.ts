import { describe, expect, it, vi } from "vitest";

import { collectAssetMediaStorageKeys, createAssetMediaStorage, inferAssetMediaFileExtension, isAssetMediaStorageKey, parseAssetMediaStorageKey } from "./asset-media-storage";

function createTestStorage() {
    const imageBlobs = new Map<string, Blob>();
    const mediaBlobs = new Map<string, Blob>();
    const storage = createAssetMediaStorage({
        image: {
            readBlob: vi.fn(async (storageKey) => imageBlobs.get(storageKey) || null),
            writeBlob: vi.fn(async (storageKey, blob) => {
                imageBlobs.set(storageKey, blob);
                return `blob:image:${storageKey}`;
            }),
            resolveUrl: vi.fn(async (storageKey, fallback = "") => (imageBlobs.has(storageKey) ? `blob:image:${storageKey}` : fallback)),
        },
        media: {
            readBlob: vi.fn(async (storageKey) => mediaBlobs.get(storageKey) || null),
            writeBlob: vi.fn(async (storageKey, blob) => {
                mediaBlobs.set(storageKey, blob);
                return `blob:media:${storageKey}`;
            }),
            resolveUrl: vi.fn(async (storageKey, fallback = "") => (mediaBlobs.has(storageKey) ? `blob:media:${storageKey}` : fallback)),
        },
    });
    return { imageBlobs, mediaBlobs, storage };
}

describe("asset media storage", () => {
    it("recognizes and parses local media storage keys", () => {
        expect(["image:1", "video:1", "audio:1", "file:1", "video-reference:1", "audio-reference:1"].every(isAssetMediaStorageKey)).toBe(true);
        expect(["", "image:", "asset:image:1", "https://example.test/image:1", "blob:image:1", "text:1"].some(isAssetMediaStorageKey)).toBe(false);
        expect(parseAssetMediaStorageKey("video-reference:abc")).toEqual({ kind: "video-reference", storageKey: "video-reference:abc" });
        expect(parseAssetMediaStorageKey("https://example.test/video:abc")).toBeNull();
    });

    it("collects storage keys recursively without collecting storage-looking URL fragments", () => {
        const keys = collectAssetMediaStorageKeys({
            asset: { data: { storageKey: "image:asset" } },
            nodes: [
                { metadata: { storageKey: "video:node", refs: ["audio:ref", "https://cdn.test/file:not-local"] } },
                "video-reference:shot",
                ["audio-reference:shot", "blob:image:not-local", "plain text"],
            ],
            ignored: { url: "https://example.test/image:asset", value: "not-a-key" },
        });

        expect([...keys].sort()).toEqual(["audio-reference:shot", "audio:ref", "image:asset", "video-reference:shot", "video:node"]);
    });

    it("routes blob reads, writes, and URL recovery behind one interface", async () => {
        const { imageBlobs, mediaBlobs, storage } = createTestStorage();
        const imageBlob = new Blob(["image"], { type: "image/png" });
        const videoBlob = new Blob(["video"], { type: "video/mp4" });

        await expect(storage.writeBlob("image:one", imageBlob)).resolves.toBe("blob:image:image:one");
        await expect(storage.writeBlob("video:one", videoBlob)).resolves.toBe("blob:media:video:one");
        await expect(storage.readBlob("image:one")).resolves.toBe(imageBlob);
        await expect(storage.readBlob("video:one")).resolves.toBe(videoBlob);
        await expect(storage.resolveUrl("image:missing", "fallback")).resolves.toBe("fallback");
        await expect(storage.resolveUrl("video:one", "fallback")).resolves.toBe("blob:media:video:one");
        expect(imageBlobs.has("image:one")).toBe(true);
        expect(mediaBlobs.has("video:one")).toBe(true);
    });

    it("infers file extensions from mime type with storage-key fallbacks", () => {
        expect(inferAssetMediaFileExtension("image/webp", "image:one")).toBe("webp");
        expect(inferAssetMediaFileExtension("audio/mpeg", "audio:one")).toBe("mp3");
        expect(inferAssetMediaFileExtension("", "image:one")).toBe("png");
        expect(inferAssetMediaFileExtension("", "video:one")).toBe("mp4");
        expect(inferAssetMediaFileExtension("", "audio:one")).toBe("mp3");
        expect(inferAssetMediaFileExtension("", "file:one")).toBe("bin");
    });
});
