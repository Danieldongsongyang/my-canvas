import { describe, expect, it, vi } from "vitest";

import { findAssetReferences } from "@/services/asset-references";
import { defaultConfig } from "@/stores/use-config-store";

import type { CanvasProject } from "../stores/use-canvas-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";
import { generateCanvasTextToImage, retryCanvasGeneratedImage, type CanvasImageGenerationRequester } from "./canvas-generation-orchestration";
import type { CanvasAssetCreator } from "./canvas-asset-intake";
import type { CanvasNodeMediaAdapter } from "./canvas-node-media";

function textNode(overrides: Partial<CanvasNodeData> = {}): CanvasNodeData {
    return {
        id: "text-1",
        type: CanvasNodeType.Text,
        title: "提示词",
        position: { x: 20, y: 40 },
        width: 320,
        height: 180,
        metadata: { content: "一只白色茶杯", status: "success" },
        ...overrides,
    };
}

function createMediaAdapter(): CanvasNodeMediaAdapter {
    return {
        image: {
            upload: vi.fn(async (input: string | Blob) => ({
                url: `blob:${String(input).slice(-3)}`,
                storageKey: `image:${String(input).slice(-3)}`,
                width: 1024,
                height: 768,
                bytes: 1234,
                mimeType: "image/png",
            })),
            resolveUrl: vi.fn(async (_storageKey: string, fallback = "") => fallback),
            listStorageKeys: vi.fn(async () => []),
            deleteStorageKeys: vi.fn(async () => undefined),
        },
        media: {
            upload: vi.fn(),
            resolveUrl: vi.fn(async (_storageKey: string, fallback = "") => fallback),
            listStorageKeys: vi.fn(async () => []),
            deleteStorageKeys: vi.fn(async () => undefined),
        },
    };
}

function config() {
    return { ...defaultConfig, model: "image-model", size: "1:1", quality: "auto", count: "1" };
}

function ids(...values: string[]) {
    let index = 0;
    return () => values[index++] || `id-${index}`;
}

function canvasProject(nodes: CanvasNodeData[], connections: CanvasConnection[] = []): CanvasProject {
    return {
        id: "canvas-1",
        title: "画布",
        createdAt: "2026-07-03T10:00:00.000Z",
        updatedAt: "2026-07-03T10:00:00.000Z",
        nodes,
        connections,
        groups: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: { x: 0, y: 0, k: 1 },
    };
}

describe("canvas generation orchestration", () => {
    it("creates text-to-image loading graph and persists successful media through the media adapter", async () => {
        let resolveGeneration: (value: Array<{ dataUrl: string }>) => void = () => undefined;
        const generationPromise = new Promise<Array<{ dataUrl: string }>>((resolve) => {
            resolveGeneration = resolve;
        });
        const requester: CanvasImageGenerationRequester = {
            generate: vi.fn(async () => generationPromise),
            edit: vi.fn(),
        };
        const mediaAdapter = createMediaAdapter();
        const addAsset: CanvasAssetCreator = vi.fn(() => "asset-1");
        const onStart = vi.fn();

        const pendingResult = generateCanvasTextToImage({
            nodes: [textNode()],
            connections: [],
            sourceNodeId: "text-1",
            prompt: "一只白色茶杯",
            effectivePrompt: "一只白色茶杯，产品摄影",
            generationConfig: config(),
            referenceImages: [],
            createId: ids("image-1"),
            createConnectionId: ids("conn-text-image"),
            requester,
            mediaAdapter,
            assetIntake: {
                canvasId: "canvas-1",
                addAsset,
                now: () => "2026-07-03T10:00:00.000Z",
            },
            onStart,
        });

        expect(onStart).toHaveBeenCalledWith(
            expect.objectContaining({
                rootNodeId: "image-1",
                pendingNodeIds: ["image-1"],
                nodes: expect.arrayContaining([expect.objectContaining({ id: "image-1", metadata: expect.objectContaining({ status: "loading" }) })]),
            }),
        );

        resolveGeneration([{ dataUrl: "data:image/png;base64,AAA" }]);
        const result = await pendingResult;

        expect(requester.generate).toHaveBeenCalledWith(expect.objectContaining({ count: "1", model: "image-model" }), "一只白色茶杯，产品摄影");
        expect(mediaAdapter.image.upload).toHaveBeenCalledWith("data:image/png;base64,AAA");
        expect(addAsset).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: "image",
                coverUrl: "blob:AAA",
                data: expect.objectContaining({ dataUrl: "blob:AAA", storageKey: "image:AAA", width: 1024, height: 768 }),
                metadata: expect.objectContaining({ source: "canvas-generation", canvasRole: "generated", canvasId: "canvas-1", nodeId: "image-1", sourceNodeId: "text-1" }),
            }),
        );
        expect(result.connections).toEqual<CanvasConnection[]>([{ id: "conn-text-image", fromNodeId: "text-1", toNodeId: "image-1" }]);
        expect(result.nodes[0]).toMatchObject({ id: "text-1", type: CanvasNodeType.Text, metadata: { content: "一只白色茶杯", prompt: "一只白色茶杯", status: "success" } });
        expect(result.nodes[1]).toMatchObject({
            id: "image-1",
            type: CanvasNodeType.Image,
            metadata: {
                content: "blob:AAA",
                storageKey: "image:AAA",
                status: "success",
                prompt: "一只白色茶杯，产品摄影",
                generationType: "generation",
                primaryImageId: "image-1",
                assetRef: {
                    assetId: "asset-1",
                    kind: "image",
                    role: "reference",
                    metadata: expect.objectContaining({
                        source: "canvas-generation",
                        canvasRole: "generated",
                        storageKey: "image:AAA",
                    }),
                },
            },
        });
        expect(result.uiState.selectedNodeIds).toEqual(new Set(["text-1"]));
        expect(result.uiState).toMatchObject({ selectedConnectionId: null, dialogNodeId: "text-1" });
        expect(result.hasSuccess).toBe(true);
        expect(result.hasFailure).toBe(false);
    });

    it("records failed text-to-image generation on the output node without losing the source text node", async () => {
        const requester: CanvasImageGenerationRequester = {
            generate: vi.fn(async () => {
                throw new Error("模型暂不可用");
            }),
            edit: vi.fn(),
        };

        const result = await generateCanvasTextToImage({
            nodes: [textNode()],
            connections: [],
            sourceNodeId: "text-1",
            prompt: "一只白色茶杯",
            effectivePrompt: "一只白色茶杯",
            generationConfig: config(),
            referenceImages: [],
            createId: ids("image-1"),
            createConnectionId: ids("conn-text-image"),
            requester,
            mediaAdapter: createMediaAdapter(),
        });

        expect(result.nodes.find((node) => node.id === "text-1")).toMatchObject({ metadata: { content: "一只白色茶杯", status: "success" } });
        expect(result.nodes.find((node) => node.id === "image-1")).toMatchObject({ metadata: { status: "error", errorDetails: "全部图片生成失败", prompt: "一只白色茶杯" } });
        expect(result.connections).toEqual([{ id: "conn-text-image", fromNodeId: "text-1", toNodeId: "image-1" }]);
        expect(result.hasSuccess).toBe(false);
        expect(result.hasFailure).toBe(true);
    });

    it("creates independent asset refs for every successful batch child image", async () => {
        const requester: CanvasImageGenerationRequester = {
            generate: vi.fn().mockResolvedValueOnce([{ dataUrl: "data:image/png;base64,AAA" }]).mockResolvedValueOnce([{ dataUrl: "data:image/png;base64,BBB" }]),
            edit: vi.fn(),
        };
        const mediaAdapter = createMediaAdapter();
        const addAsset: CanvasAssetCreator = vi.fn().mockReturnValueOnce("asset-child-a").mockReturnValueOnce("asset-child-b");

        const result = await generateCanvasTextToImage({
            nodes: [textNode()],
            connections: [],
            sourceNodeId: "text-1",
            prompt: "一只白色茶杯",
            effectivePrompt: "一只白色茶杯，产品摄影",
            generationConfig: { ...config(), count: "2" },
            referenceImages: [],
            createId: ids("root-1", "child-a", "child-b"),
            createConnectionId: ids("conn-text-root", "conn-root-child-a", "conn-root-child-b"),
            requester,
            mediaAdapter,
            assetIntake: {
                canvasId: "canvas-1",
                addAsset,
                now: () => "2026-07-03T10:00:00.000Z",
            },
        });

        const root = result.nodes.find((node) => node.id === "root-1")!;
        const childA = result.nodes.find((node) => node.id === "child-a")!;
        const childB = result.nodes.find((node) => node.id === "child-b")!;

        expect(addAsset).toHaveBeenCalledTimes(2);
        expect(addAsset).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                data: expect.objectContaining({ dataUrl: "blob:AAA", storageKey: "image:AAA", width: 1024, height: 768, bytes: 1234, mimeType: "image/png" }),
                metadata: expect.objectContaining({ nodeId: "child-a", rootNodeId: "root-1", batchId: "root-1" }),
            }),
        );
        expect(addAsset).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                data: expect.objectContaining({ dataUrl: "blob:BBB", storageKey: "image:BBB" }),
                metadata: expect.objectContaining({ nodeId: "child-b", rootNodeId: "root-1", batchId: "root-1" }),
            }),
        );
        expect(root.metadata).toMatchObject({
            status: "success",
            isBatchRoot: true,
            batchChildIds: ["child-a", "child-b"],
            primaryImageId: "child-a",
        });
        expect(root.metadata?.assetRef).toMatchObject({ assetId: "asset-child-a", kind: "image", role: "reference" });
        expect(childA.metadata).toMatchObject({
            content: "blob:AAA",
            storageKey: "image:AAA",
            bytes: 1234,
            mimeType: "image/png",
            assetRef: {
                assetId: "asset-child-a",
                kind: "image",
                role: "reference",
                metadata: expect.objectContaining({ source: "canvas-generation", canvasRole: "generated", nodeId: "child-a", rootNodeId: "root-1", storageKey: "image:AAA" }),
            },
        });
        expect(childB.metadata).toMatchObject({
            content: "blob:BBB",
            storageKey: "image:BBB",
            bytes: 1234,
            mimeType: "image/png",
            assetRef: {
                assetId: "asset-child-b",
                kind: "image",
                role: "reference",
                metadata: expect.objectContaining({ source: "canvas-generation", canvasRole: "generated", nodeId: "child-b", rootNodeId: "root-1", storageKey: "image:BBB" }),
            },
        });
        expect(childA.metadata?.assetRef?.assetId).not.toBe(childB.metadata?.assetRef?.assetId);
        expect(findAssetReferences("asset-child-b", { studioSeries: [], canvasProjects: [canvasProject(result.nodes, result.connections)] })).toEqual([
            expect.objectContaining({ source: "canvas", assetId: "asset-child-b", canvasId: "canvas-1", nodeId: "child-b", label: "画布 / 一只白色茶杯，产品摄影" }),
        ]);
    });

    it("creates assets only for successful batch children when part of the batch fails", async () => {
        const requester: CanvasImageGenerationRequester = {
            generate: vi.fn().mockResolvedValueOnce([{ dataUrl: "data:image/png;base64,AAA" }]).mockRejectedValueOnce(new Error("第二张失败")),
            edit: vi.fn(),
        };
        const mediaAdapter = createMediaAdapter();
        const addAsset: CanvasAssetCreator = vi.fn(() => "asset-child-a");

        const result = await generateCanvasTextToImage({
            nodes: [textNode()],
            connections: [],
            sourceNodeId: "text-1",
            prompt: "一只白色茶杯",
            effectivePrompt: "一只白色茶杯，产品摄影",
            generationConfig: { ...config(), count: "2" },
            referenceImages: [],
            createId: ids("root-1", "child-a", "child-b"),
            createConnectionId: ids("conn-text-root", "conn-root-child-a", "conn-root-child-b"),
            requester,
            mediaAdapter,
            assetIntake: {
                canvasId: "canvas-1",
                addAsset,
                now: () => "2026-07-03T10:00:00.000Z",
            },
        });

        const root = result.nodes.find((node) => node.id === "root-1")!;
        const childA = result.nodes.find((node) => node.id === "child-a")!;
        const childB = result.nodes.find((node) => node.id === "child-b")!;

        expect(addAsset).toHaveBeenCalledTimes(1);
        expect(root.metadata).toMatchObject({ status: "success", primaryImageId: "child-a", assetRef: { assetId: "asset-child-a", kind: "image", role: "reference" } });
        expect(childA.metadata).toMatchObject({ status: "success", content: "blob:AAA", storageKey: "image:AAA", assetRef: { assetId: "asset-child-a", kind: "image", role: "reference" } });
        expect(childB.metadata).toMatchObject({ status: "error", errorDetails: "第二张失败", batchRootId: "root-1" });
        expect(childB.metadata).not.toHaveProperty("assetRef");
        expect(childB.metadata).not.toHaveProperty("content");
        expect(result.hasSuccess).toBe(true);
        expect(result.hasFailure).toBe(true);
    });

    it("retries a failed generated image through fake generation and media adapters", async () => {
        const mediaAdapter = createMediaAdapter();
        const failed = await generateCanvasTextToImage({
            nodes: [textNode()],
            connections: [],
            sourceNodeId: "text-1",
            prompt: "一只白色茶杯",
            effectivePrompt: "一只白色茶杯",
            generationConfig: config(),
            referenceImages: [],
            createId: ids("image-1"),
            createConnectionId: ids("conn-text-image"),
            requester: {
                generate: vi.fn(async () => {
                    throw new Error("失败");
                }),
                edit: vi.fn(),
            },
            mediaAdapter,
        });
        const retryRequester: CanvasImageGenerationRequester = {
            generate: vi.fn(async () => [{ dataUrl: "data:image/png;base64,BBB" }]),
            edit: vi.fn(),
        };
        const failedNode = failed.nodes.find((node) => node.id === "image-1")!;

        const nodes = await retryCanvasGeneratedImage({
            nodes: failed.nodes,
            node: failedNode,
            prompt: "一只白色茶杯",
            generationConfig: config(),
            retryImages: [],
            useReferenceImages: false,
            savedImageMetadata: failedNode.metadata,
            requester: retryRequester,
            mediaAdapter,
        });

        expect(retryRequester.generate).toHaveBeenCalledWith(expect.objectContaining({ count: "1" }), "一只白色茶杯");
        expect(nodes.find((node) => node.id === "text-1")).toMatchObject({ metadata: { content: "一只白色茶杯", status: "success" } });
        expect(nodes.find((node) => node.id === "image-1")).toMatchObject({
            metadata: {
                content: "blob:BBB",
                storageKey: "image:BBB",
                status: "success",
                prompt: "一只白色茶杯",
                generationType: "generation",
            },
        });
    });
});
