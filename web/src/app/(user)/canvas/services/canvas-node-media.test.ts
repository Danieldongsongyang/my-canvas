import { describe, expect, it, vi } from "vitest";

import type { CanvasProject } from "../stores/use-canvas-store";
import { CanvasNodeType, type CanvasAssistantSession, type CanvasNodeData } from "../types";
import { cleanupUnusedCanvasImageMedia, hydrateCanvasAssistantImageMedia, hydrateCanvasNodeImageMedia, materializeCanvasImageMedia, type CanvasImageMediaAdapter } from "./canvas-node-media";

function createAdapter(): CanvasImageMediaAdapter {
    const entries = new Map([
        ["image:node", "blob:node"],
        ["image:assistant", "blob:assistant"],
        ["image:history", "blob:history"],
        ["image:asset", "blob:asset"],
        ["image:orphan", "blob:orphan"],
    ]);
    return {
        upload: vi.fn(async (input: string | Blob) => ({ url: `blob:migrated:${String(input).slice(-3)}`, storageKey: "image:migrated", width: 640, height: 480, bytes: 123, mimeType: "image/png" })),
        resolveUrl: vi.fn(async (storageKey: string, fallback = "") => entries.get(storageKey) || fallback),
        listStorageKeys: vi.fn(async () => Array.from(entries.keys())),
        deleteStorageKeys: vi.fn(async (keys: Iterable<string>) => {
            for (const key of keys) entries.delete(key);
        }),
    };
}

function imageNode(metadata: CanvasNodeData["metadata"]): CanvasNodeData {
    return { id: "node-1", type: CanvasNodeType.Image, title: "图片", position: { x: 0, y: 0 }, width: 320, height: 240, metadata };
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

describe("canvas node image media", () => {
    it("hydrates persisted image node storage keys to displayable URLs", async () => {
        const adapter = createAdapter();
        const node = imageNode({ content: "blob:stale", storageKey: "image:node", status: "success" });

        await expect(hydrateCanvasNodeImageMedia(node, adapter)).resolves.toMatchObject({
            metadata: { content: "blob:node", storageKey: "image:node" },
        });
    });

    it("migrates legacy inline data URL image node media through the adapter", async () => {
        const adapter = createAdapter();
        const node = imageNode({ content: "data:image/png;base64,AAA", status: "success" });

        await expect(hydrateCanvasNodeImageMedia(node, adapter)).resolves.toMatchObject({
            metadata: { content: "blob:migrated:AAA", storageKey: "image:migrated", naturalWidth: 640, naturalHeight: 480, bytes: 123, mimeType: "image/png" },
        });
        expect(adapter.upload).toHaveBeenCalledWith("data:image/png;base64,AAA");
    });

    it("hydrates and migrates assistant image media without caller storage branching", async () => {
        const adapter = createAdapter();
        const sessions = await hydrateCanvasAssistantImageMedia(
            [
                assistantSession(),
                { ...assistantSession(), id: "session-2", messages: [{ id: "message-2", role: "assistant", mode: "image", text: "", images: [{ id: "legacy", dataUrl: "data:image/png;base64,BBB", prompt: "旧图" }] }] },
            ],
            adapter,
        );

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

    it("cleans up only image media unused by projects, history, assistant sessions, or local assets", async () => {
        const adapter = createAdapter();

        await cleanupUnusedCanvasImageMedia(
            {
                projects: [project({ nodes: [imageNode({ content: "blob:node", storageKey: "image:node" })], chatSessions: [assistantSession()] })],
                assets: [{ kind: "image", data: { dataUrl: "blob:asset", storageKey: "image:asset" } }],
                history: { past: [{ nodes: [imageNode({ storageKey: "image:history" })] }], future: [] },
            },
            adapter,
        );

        expect(adapter.deleteStorageKeys).toHaveBeenCalledWith(["image:orphan"]);
    });
});
