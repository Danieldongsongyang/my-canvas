import { describe, expect, it, vi } from "vitest";

import type { CanvasProject } from "../stores/use-canvas-store";
import { CanvasNodeType, type CanvasAssistantSession, type CanvasNodeData } from "../types";
import { cleanupUnusedCanvasNodeMedia, collectCanvasNodeMediaStorageKeys, hydrateCanvasAssistantImageMedia, hydrateCanvasNodeMedia, materializeCanvasImageMedia, type CanvasNodeMediaAdapter } from "./canvas-node-media";

function createAdapter(): CanvasNodeMediaAdapter {
    const imageEntries = new Map([
        ["image:node", "blob:node"],
        ["image:assistant", "blob:assistant"],
        ["image:history", "blob:history"],
        ["image:asset", "blob:asset"],
        ["image:orphan", "blob:orphan"],
    ]);
    const mediaEntries = new Map([
        ["video:node", "blob:video-node"],
        ["audio:node", "blob:audio-node"],
        ["video:history", "blob:video-history"],
        ["audio:extra", "blob:audio-extra"],
        ["video:orphan", "blob:video-orphan"],
        ["audio:orphan", "blob:audio-orphan"],
    ]);
    const uploadImage = vi.fn(async (input: string | Blob) => ({
        url: `blob:migrated:${String(input).slice(-3)}`,
        storageKey: "image:migrated",
        width: 640,
        height: 480,
        bytes: 123,
        mimeType: "image/png",
    }));
    const uploadMedia = vi.fn(async (input: string | Blob, prefix = "file") => ({
        url: `blob:${prefix}:migrated:${String(input).slice(-3)}`,
        storageKey: `${prefix}:migrated`,
        bytes: 456,
        mimeType: `${prefix}/mp4`,
        width: prefix === "video" ? 1280 : undefined,
        height: prefix === "video" ? 720 : undefined,
        durationMs: 9000,
    }));

    return {
        image: {
            upload: uploadImage,
            resolveUrl: vi.fn(async (storageKey: string, fallback = "") => imageEntries.get(storageKey) || fallback),
            listStorageKeys: vi.fn(async () => Array.from(imageEntries.keys())),
            deleteStorageKeys: vi.fn(async (keys: Iterable<string>) => {
                for (const key of keys) imageEntries.delete(key);
            }),
        },
        media: {
            upload: uploadMedia,
            resolveUrl: vi.fn(async (storageKey: string, fallback = "") => mediaEntries.get(storageKey) || fallback),
            listStorageKeys: vi.fn(async () => Array.from(mediaEntries.keys())),
            deleteStorageKeys: vi.fn(async (keys: Iterable<string>) => {
                for (const key of keys) mediaEntries.delete(key);
            }),
        },
    };
}

function imageNode(metadata: CanvasNodeData["metadata"]): CanvasNodeData {
    return { id: "node-1", type: CanvasNodeType.Image, title: "图片", position: { x: 0, y: 0 }, width: 320, height: 240, metadata };
}

function videoNode(metadata: CanvasNodeData["metadata"]): CanvasNodeData {
    return { id: "video-1", type: CanvasNodeType.Video, title: "视频", position: { x: 0, y: 0 }, width: 320, height: 180, metadata };
}

function audioNode(metadata: CanvasNodeData["metadata"]): CanvasNodeData {
    return { id: "audio-1", type: CanvasNodeType.Audio, title: "音频", position: { x: 0, y: 0 }, width: 260, height: 120, metadata };
}

function project(overrides: Partial<CanvasProject> = {}): CanvasProject {
    return {
        id: "canvas-1",
        title: "画布",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        nodes: [],
        connections: [],
        groups: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: { x: 0, y: 0, k: 1 },
        ...overrides,
    };
}

function assistantSession(): CanvasAssistantSession {
    return {
        id: "session-1",
        title: "助手",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        messages: [{ id: "message-1", role: "assistant", mode: "image", text: "", images: [{ id: "assistant-image", dataUrl: "blob:old", storageKey: "image:assistant", prompt: "图" }] }],
    };
}

describe("canvas node media", () => {
    it("hydrates persisted image node storage keys to displayable URLs", async () => {
        const adapter = createAdapter();
        const node = imageNode({ content: "blob:stale", storageKey: "image:node", status: "success" });

        await expect(hydrateCanvasNodeMedia(node, adapter)).resolves.toMatchObject({
            metadata: { content: "blob:node", storageKey: "image:node" },
        });
    });

    it("hydrates persisted video and audio node storage keys to playable URLs with stable metadata", async () => {
        const adapter = createAdapter();
        const video = videoNode({
            content: "blob:stale",
            storageKey: "video:node",
            status: "success",
            naturalWidth: 1280,
            naturalHeight: 720,
            bytes: 456,
            mimeType: "video/mp4",
            durationMs: 9000,
        });
        const audio = audioNode({
            content: "blob:old",
            storageKey: "audio:node",
            status: "success",
            bytes: 222,
            mimeType: "audio/mpeg",
            durationMs: 3000,
        });

        await expect(hydrateCanvasNodeMedia(video, adapter)).resolves.toMatchObject({
            metadata: { content: "blob:video-node", storageKey: "video:node", naturalWidth: 1280, naturalHeight: 720, bytes: 456, mimeType: "video/mp4", durationMs: 9000 },
        });
        await expect(hydrateCanvasNodeMedia(audio, adapter)).resolves.toMatchObject({
            metadata: { content: "blob:audio-node", storageKey: "audio:node", bytes: 222, mimeType: "audio/mpeg", durationMs: 3000 },
        });
    });

    it("migrates legacy inline data URL image node media through the adapter", async () => {
        const adapter = createAdapter();
        const node = imageNode({ content: "data:image/png;base64,AAA", status: "success" });

        await expect(hydrateCanvasNodeMedia(node, adapter)).resolves.toMatchObject({
            metadata: { content: "blob:migrated:AAA", storageKey: "image:migrated", naturalWidth: 640, naturalHeight: 480, bytes: 123, mimeType: "image/png" },
        });
        expect(adapter.image.upload).toHaveBeenCalledWith("data:image/png;base64,AAA");
    });

    it("hydrates and migrates assistant image media without caller storage branching", async () => {
        const adapter = createAdapter();
        const legacySession: CanvasAssistantSession = {
            ...assistantSession(),
            id: "session-2",
            messages: [{ id: "message-2", role: "assistant", mode: "image", text: "", images: [{ id: "legacy", dataUrl: "data:image/png;base64,BBB", prompt: "旧图" }] }],
        };

        const sessions = await hydrateCanvasAssistantImageMedia([assistantSession(), legacySession], adapter);

        expect(sessions[0].messages[0].images?.[0]).toMatchObject({ dataUrl: "blob:assistant", storageKey: "image:assistant" });
        expect(sessions[1].messages[0].images?.[0]).toMatchObject({ dataUrl: "blob:migrated:BBB", storageKey: "image:migrated" });
    });

    it("materializes existing or inline image media without caller storage branching", async () => {
        const adapter = createAdapter();

        await expect(materializeCanvasImageMedia({ dataUrl: "blob:old", storageKey: "image:node" }, adapter)).resolves.toMatchObject({
            url: "blob:node",
            storageKey: "image:node",
        });
        await expect(materializeCanvasImageMedia({ dataUrl: "data:image/png;base64,AAA" }, adapter)).resolves.toMatchObject({
            url: "blob:migrated:AAA",
            storageKey: "image:migrated",
            width: 640,
            height: 480,
        });
    });

    it("collects canvas node media keys from storage fields and reference strings", () => {
        const keys = collectCanvasNodeMediaStorageKeys({
            nodes: [
                imageNode({ storageKey: "image:node", references: ["image:history"] }),
                videoNode({ storageKey: "video:node", references: ["video:history", "video-reference:node"] }),
                audioNode({ storageKey: "audio:node", references: ["audio:extra", "audio-reference:node"] }),
            ],
            ignored: ["not-a-storage-key", "http://example.test/image:node"],
        });

        expect([...keys].sort()).toEqual(["audio-reference:node", "audio:extra", "audio:node", "image:history", "image:node", "video-reference:node", "video:history", "video:node"]);
    });

    it("cleans up unused node media while keeping image media used by projects, history, assistant sessions, or local assets", async () => {
        const adapter = createAdapter();

        await cleanupUnusedCanvasNodeMedia(
            {
                projects: [project({ nodes: [imageNode({ content: "blob:node", storageKey: "image:node" })], chatSessions: [assistantSession()] })],
                assets: [{ kind: "image", data: { dataUrl: "blob:asset", storageKey: "image:asset" } }],
                history: { past: [{ nodes: [imageNode({ storageKey: "image:history" })] }], future: [] },
            },
            adapter,
        );

        expect(adapter.image.deleteStorageKeys).toHaveBeenCalledWith(["image:orphan"]);
        expect(adapter.media.deleteStorageKeys).toHaveBeenCalledWith(["video:node", "audio:node", "video:history", "audio:extra", "video:orphan", "audio:orphan"]);
    });

    it("cleans up image, video, and audio media through one module-level behavior", async () => {
        const adapter = createAdapter();

        await cleanupUnusedCanvasNodeMedia(
            {
                projects: [project({ nodes: [imageNode({ storageKey: "image:node" }), videoNode({ storageKey: "video:node" }), audioNode({ storageKey: "audio:node" })], chatSessions: [assistantSession()] })],
                assets: [{ kind: "image", data: { dataUrl: "blob:asset", storageKey: "image:asset" } }],
                history: { past: [{ nodes: [imageNode({ storageKey: "image:history" }), videoNode({ storageKey: "video:history" })] }], future: [] },
                extra: { nodes: [audioNode({ storageKey: "audio:extra" })] },
            },
            adapter,
        );

        expect(adapter.image.deleteStorageKeys).toHaveBeenCalledWith(["image:orphan"]);
        expect(adapter.media.deleteStorageKeys).toHaveBeenCalledWith(["video:orphan", "audio:orphan"]);
    });
});
