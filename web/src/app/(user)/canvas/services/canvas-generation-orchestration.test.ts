import { describe, expect, it, vi } from "vitest";

import { findAssetReferences } from "@/services/asset-references";
import { defaultConfig } from "@/stores/use-config-store";

import type { CanvasProject } from "../stores/use-canvas-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";
import { generateCanvasTextToImage, retryCanvasGeneratedImage, type CanvasImageGenerationRequester } from "./canvas-generation-orchestration";
import type { CanvasAssetCreator } from "./canvas-asset-intake";
import type { CanvasNodeMediaAdapter } from "./canvas-node-media";

const CANVAS_ID = "canvas-1";
const CANVAS_TITLE = "画布";
const FIXED_NOW = "2026-07-03T10:00:00.000Z";
const PROMPT = "一只白色茶杯";
const EFFECTIVE_PROMPT = "一只白色茶杯，产品摄影";

function textNode(overrides: Partial<CanvasNodeData> = {}): CanvasNodeData {
    return {
        id: "text-1",
        type: CanvasNodeType.Text,
        title: "提示词",
        position: { x: 20, y: 40 },
        width: 320,
        height: 180,
        metadata: { content: PROMPT, status: "success" },
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

function config(count = "1") {
    return { ...defaultConfig, model: "image-model", size: "1:1", quality: "auto", count };
}

function ids(...values: string[]) {
    let index = 0;
    return () => values[index++] || `id-${index}`;
}

function imageDataUrl(id: string) {
    return `data:image/png;base64,${id}`;
}

function canvasAssetIntake(addAsset: CanvasAssetCreator) {
    return {
        canvasId: CANVAS_ID,
        addAsset,
        now: () => FIXED_NOW,
    };
}

function canvasProject(nodes: CanvasNodeData[], connections: CanvasConnection[] = []): CanvasProject {
    return {
        id: CANVAS_ID,
        title: CANVAS_TITLE,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
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

function nodeById(nodes: CanvasNodeData[], id: string): CanvasNodeData {
    const node = nodes.find((item) => item.id === id);
    if (!node) throw new Error(`Expected canvas node ${id}`);
    return node;
}

function generateTwoImageBatch(params: { requester: CanvasImageGenerationRequester; mediaAdapter: CanvasNodeMediaAdapter; addAsset: CanvasAssetCreator }) {
    return generateCanvasTextToImage({
        nodes: [textNode()],
        connections: [],
        sourceNodeId: "text-1",
        prompt: PROMPT,
        effectivePrompt: EFFECTIVE_PROMPT,
        generationConfig: config("2"),
        referenceImages: [],
        createId: ids("root-1", "child-a", "child-b"),
        createConnectionId: ids("conn-text-root", "conn-root-child-a", "conn-root-child-b"),
        requester: params.requester,
        mediaAdapter: params.mediaAdapter,
        assetIntake: canvasAssetIntake(params.addAsset),
    });
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
            prompt: PROMPT,
            effectivePrompt: EFFECTIVE_PROMPT,
            generationConfig: config(),
            referenceImages: [],
            createId: ids("image-1"),
            createConnectionId: ids("conn-text-image"),
            requester,
            mediaAdapter,
            assetIntake: canvasAssetIntake(addAsset),
            onStart,
        });

        expect(onStart).toHaveBeenCalledWith(
            expect.objectContaining({
                rootNodeId: "image-1",
                pendingNodeIds: ["image-1"],
                nodes: expect.arrayContaining([expect.objectContaining({ id: "image-1", metadata: expect.objectContaining({ status: "loading" }) })]),
            }),
        );

        resolveGeneration([{ dataUrl: imageDataUrl("AAA") }]);
        const result = await pendingResult;

        expect(requester.generate).toHaveBeenCalledWith(expect.objectContaining({ count: "1", model: "image-model" }), EFFECTIVE_PROMPT);
        expect(mediaAdapter.image.upload).toHaveBeenCalledWith(imageDataUrl("AAA"));
        expect(addAsset).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: "image",
                coverUrl: "blob:AAA",
                data: expect.objectContaining({ dataUrl: "blob:AAA", storageKey: "image:AAA", width: 1024, height: 768 }),
                metadata: expect.objectContaining({ source: "canvas-generation", canvasRole: "generated", canvasId: CANVAS_ID, nodeId: "image-1", sourceNodeId: "text-1" }),
            }),
        );
        expect(result.connections).toEqual<CanvasConnection[]>([{ id: "conn-text-image", fromNodeId: "text-1", toNodeId: "image-1" }]);
        expect(result.nodes[0]).toMatchObject({ id: "text-1", type: CanvasNodeType.Text, metadata: { content: PROMPT, prompt: PROMPT, status: "success" } });
        expect(result.nodes[1]).toMatchObject({
            id: "image-1",
            type: CanvasNodeType.Image,
            metadata: {
                content: "blob:AAA",
                storageKey: "image:AAA",
                status: "success",
                prompt: EFFECTIVE_PROMPT,
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
            prompt: PROMPT,
            effectivePrompt: PROMPT,
            generationConfig: config(),
            referenceImages: [],
            createId: ids("image-1"),
            createConnectionId: ids("conn-text-image"),
            requester,
            mediaAdapter: createMediaAdapter(),
        });

        expect(nodeById(result.nodes, "text-1")).toMatchObject({ metadata: { content: PROMPT, status: "success" } });
        expect(nodeById(result.nodes, "image-1")).toMatchObject({ metadata: { status: "error", errorDetails: "全部图片生成失败", prompt: PROMPT } });
        expect(result.connections).toEqual([{ id: "conn-text-image", fromNodeId: "text-1", toNodeId: "image-1" }]);
        expect(result.hasSuccess).toBe(false);
        expect(result.hasFailure).toBe(true);
    });

    it("creates independent asset refs for every successful batch child image", async () => {
        const requester: CanvasImageGenerationRequester = {
            generate: vi
                .fn()
                .mockResolvedValueOnce([{ dataUrl: imageDataUrl("AAA") }])
                .mockResolvedValueOnce([{ dataUrl: imageDataUrl("BBB") }]),
            edit: vi.fn(),
        };
        const mediaAdapter = createMediaAdapter();
        const addAsset: CanvasAssetCreator = vi.fn().mockReturnValueOnce("asset-child-a").mockReturnValueOnce("asset-child-b");

        const result = await generateTwoImageBatch({ requester, mediaAdapter, addAsset });

        const root = nodeById(result.nodes, "root-1");
        const childA = nodeById(result.nodes, "child-a");
        const childB = nodeById(result.nodes, "child-b");

        expect(addAsset).toHaveBeenCalledTimes(2);
        expect(addAsset).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                data: expect.objectContaining({
                    dataUrl: "blob:AAA",
                    storageKey: "image:AAA",
                    width: 1024,
                    height: 768,
                    bytes: 1234,
                    mimeType: "image/png",
                }),
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
                metadata: expect.objectContaining({
                    source: "canvas-generation",
                    canvasRole: "generated",
                    nodeId: "child-a",
                    rootNodeId: "root-1",
                    storageKey: "image:AAA",
                }),
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
                metadata: expect.objectContaining({
                    source: "canvas-generation",
                    canvasRole: "generated",
                    nodeId: "child-b",
                    rootNodeId: "root-1",
                    storageKey: "image:BBB",
                }),
            },
        });
        expect(childA.metadata?.assetRef?.assetId).not.toBe(childB.metadata?.assetRef?.assetId);
        expect(findAssetReferences("asset-child-b", { studioSeries: [], canvasProjects: [canvasProject(result.nodes, result.connections)] })).toEqual([
            expect.objectContaining({ source: "canvas", assetId: "asset-child-b", canvasId: CANVAS_ID, nodeId: "child-b", label: `${CANVAS_TITLE} / ${EFFECTIVE_PROMPT}` }),
        ]);
    });

    it("creates assets only for successful batch children when part of the batch fails", async () => {
        const requester: CanvasImageGenerationRequester = {
            generate: vi
                .fn()
                .mockResolvedValueOnce([{ dataUrl: imageDataUrl("AAA") }])
                .mockRejectedValueOnce(new Error("第二张失败")),
            edit: vi.fn(),
        };
        const mediaAdapter = createMediaAdapter();
        const addAsset: CanvasAssetCreator = vi.fn(() => "asset-child-a");

        const result = await generateTwoImageBatch({ requester, mediaAdapter, addAsset });

        const root = nodeById(result.nodes, "root-1");
        const childA = nodeById(result.nodes, "child-a");
        const childB = nodeById(result.nodes, "child-b");

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
            prompt: PROMPT,
            effectivePrompt: PROMPT,
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
            generate: vi.fn(async () => [{ dataUrl: imageDataUrl("BBB") }]),
            edit: vi.fn(),
        };
        const failedNode = nodeById(failed.nodes, "image-1");

        const nodes = await retryCanvasGeneratedImage({
            nodes: failed.nodes,
            node: failedNode,
            prompt: PROMPT,
            generationConfig: config(),
            retryImages: [],
            useReferenceImages: false,
            savedImageMetadata: failedNode.metadata,
            requester: retryRequester,
            mediaAdapter,
        });

        expect(retryRequester.generate).toHaveBeenCalledWith(expect.objectContaining({ count: "1" }), PROMPT);
        expect(nodeById(nodes, "text-1")).toMatchObject({ metadata: { content: PROMPT, status: "success" } });
        expect(nodeById(nodes, "image-1")).toMatchObject({
            metadata: {
                content: "blob:BBB",
                storageKey: "image:BBB",
                status: "success",
                prompt: PROMPT,
                generationType: "generation",
            },
        });
    });

    it("creates a new image asset and assetRef when retry succeeds without dropping render cache", async () => {
        const mediaAdapter = createMediaAdapter();
        const addAsset: CanvasAssetCreator = vi.fn(() => "asset-retry-new");
        const existingNode = textNode({
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
        });
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
