import { describe, expect, it, vi } from "vitest";

import { defaultConfig } from "@/stores/use-config-store";

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

    it("creates a new image asset and assetRef when retry succeeds without dropping render cache", async () => {
        const mediaAdapter = createMediaAdapter();
        const addAsset: CanvasAssetCreator = vi.fn(() => "asset-retry-new");
        const existingNode = {
            ...textNode({
                id: "image-1",
                type: CanvasNodeType.Image,
                title: "旧图",
                width: 320,
                height: 240,
                metadata: {
                    content: "blob:old",
                    storageKey: "image:old",
                    status: "success" as const,
                    prompt: "旧提示词",
                    generationType: "generation" as const,
                    model: "old-model",
                    assetRef: {
                        assetId: "asset-old",
                        kind: "image" as const,
                        role: "reference" as const,
                        metadata: { source: "canvas-generation", canvasId: "canvas-1", nodeId: "image-1" },
                    },
                },
            }),
        };
        const requester: CanvasImageGenerationRequester = {
            generate: vi.fn(async () => [{ dataUrl: "data:image/png;base64,CCC" }]),
            edit: vi.fn(),
        };

        const nodes = await retryCanvasGeneratedImage({
            nodes: [textNode(), existingNode],
            node: existingNode,
            prompt: "新的 retry 提示词",
            generationConfig: config(),
            retryImages: [],
            useReferenceImages: false,
            savedImageMetadata: existingNode.metadata,
            requester,
            mediaAdapter,
            assetIntake: {
                canvasId: "canvas-1",
                addAsset,
                now: () => "2026-07-08T09:00:00.000Z",
            },
        });

        expect(addAsset).toHaveBeenCalledTimes(1);
        expect(addAsset).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: "image",
                coverUrl: "blob:CCC",
                data: expect.objectContaining({
                    dataUrl: "blob:CCC",
                    storageKey: "image:CCC",
                    width: 1024,
                    height: 768,
                    bytes: 1234,
                    mimeType: "image/png",
                }),
                metadata: expect.objectContaining({
                    source: "canvas-generation",
                    canvasRole: "generated",
                    canvasId: "canvas-1",
                    nodeId: "image-1",
                    rootNodeId: "image-1",
                    prompt: "新的 retry 提示词",
                    model: "image-model",
                    createdAt: "2026-07-08T09:00:00.000Z",
                }),
            }),
        );
        expect(nodes.find((node) => node.id === "image-1")).toMatchObject({
            metadata: {
                content: "blob:CCC",
                storageKey: "image:CCC",
                status: "success",
                bytes: 1234,
                mimeType: "image/png",
                prompt: "新的 retry 提示词",
                assetRef: {
                    assetId: "asset-retry-new",
                    kind: "image",
                    role: "reference",
                    metadata: expect.objectContaining({
                        source: "canvas-generation",
                        canvasRole: "generated",
                        canvasId: "canvas-1",
                        nodeId: "image-1",
                        rootNodeId: "image-1",
                        prompt: "新的 retry 提示词",
                        model: "image-model",
                        createdAt: "2026-07-08T09:00:00.000Z",
                        storageKey: "image:CCC",
                    }),
                },
            },
        });
    });

    it("does not delete or mutate the old asset when retry creates a replacement result", async () => {
        const oldAssetRef = {
            assetId: "asset-old",
            kind: "image" as const,
            role: "reference" as const,
            metadata: { source: "canvas-generation", canvasId: "canvas-1", nodeId: "image-1", storageKey: "image:old" },
        };
        const existingNode = textNode({
            id: "image-1",
            type: CanvasNodeType.Image,
            metadata: {
                content: "blob:old",
                storageKey: "image:old",
                status: "success",
                prompt: "旧提示词",
                assetRef: oldAssetRef,
            },
        });
        const addAsset: CanvasAssetCreator = vi.fn(() => "asset-new");

        await retryCanvasGeneratedImage({
            nodes: [existingNode],
            node: existingNode,
            prompt: "新提示词",
            generationConfig: config(),
            retryImages: [],
            useReferenceImages: false,
            requester: {
                generate: vi.fn(async () => [{ dataUrl: "data:image/png;base64,DDD" }]),
                edit: vi.fn(),
            },
            mediaAdapter: createMediaAdapter(),
            assetIntake: {
                canvasId: "canvas-1",
                addAsset,
            },
        });

        expect(addAsset).toHaveBeenCalledTimes(1);
        expect(vi.mocked(addAsset).mock.calls[0][0]).not.toMatchObject({ id: "asset-old" });
        expect(oldAssetRef).toEqual({
            assetId: "asset-old",
            kind: "image",
            role: "reference",
            metadata: { source: "canvas-generation", canvasId: "canvas-1", nodeId: "image-1", storageKey: "image:old" },
        });
    });

    it("does not create an asset when retry generation fails", async () => {
        const addAsset: CanvasAssetCreator = vi.fn(() => "asset-new");
        const failedNode = textNode({
            id: "image-1",
            type: CanvasNodeType.Image,
            metadata: {
                content: "blob:old",
                storageKey: "image:old",
                status: "error",
                errorDetails: "上次失败",
                prompt: "提示词",
            },
        });

        await expect(
            retryCanvasGeneratedImage({
                nodes: [failedNode],
                node: failedNode,
                prompt: "提示词",
                generationConfig: config(),
                retryImages: [],
                useReferenceImages: false,
                requester: {
                    generate: vi.fn(async () => {
                        throw new Error("模型失败");
                    }),
                    edit: vi.fn(),
                },
                mediaAdapter: createMediaAdapter(),
                assetIntake: {
                    canvasId: "canvas-1",
                    addAsset,
                },
            }),
        ).rejects.toThrow("模型失败");

        expect(addAsset).not.toHaveBeenCalled();
    });
});
