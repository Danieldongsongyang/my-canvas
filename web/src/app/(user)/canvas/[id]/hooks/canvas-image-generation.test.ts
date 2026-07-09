import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dispatch, SetStateAction } from "react";

import { defaultConfig } from "@/stores/use-config-store";
import { requestEdit, requestGeneration } from "@/services/api/image";
import { uploadImage } from "@/services/image-storage";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { generateCanvasImage } from "./canvas-image-generation";

vi.mock("@/services/api/image", () => ({
    requestGeneration: vi.fn(async () => [{ dataUrl: "data:image/png;base64,GEN" }]),
    requestEdit: vi.fn(async () => [{ dataUrl: "data:image/png;base64,EDIT" }]),
}));

vi.mock("@/services/image-storage", () => ({
    uploadImage: vi.fn(async (dataUrl: string) => ({
        url: dataUrl.includes("EDIT") ? "blob:EDIT" : "blob:GEN",
        storageKey: dataUrl.includes("EDIT") ? "image:EDIT" : "image:GEN",
        width: 2048,
        height: 1024,
        bytes: 2048,
        mimeType: "image/png",
    })),
    resolveImageUrl: vi.fn(async (_storageKey: string, fallback = "") => fallback),
    listStoredImageKeys: vi.fn(async () => []),
    deleteStoredImages: vi.fn(async () => undefined),
}));

function node(type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return {
        id: `${type}-1`,
        type,
        title: type,
        position: { x: 0, y: 0 },
        width: 320,
        height: 180,
        metadata,
    };
}

function generationContext() {
    return {
        prompt: "环形展厅",
        referenceImages: [],
        referenceVideos: [],
        referenceAudios: [],
        textCount: 0,
        imageCount: 0,
        videoCount: 0,
        audioCount: 0,
    };
}

function createState<T>(initial: T): [() => T, Dispatch<SetStateAction<T>>] {
    let value = initial;
    const getValue = () => value;
    const setValue: Dispatch<SetStateAction<T>> = (next) => {
        value = typeof next === "function" ? (next as (previous: T) => T)(value) : next;
    };
    return [getValue, setValue];
}

function imageGenerationConfig(count = "1") {
    return { ...defaultConfig, model: "image-model", imageModel: "image-model", size: "1:1", quality: "auto", count };
}

async function generateFromSource(sourceNode: CanvasNodeData, count = "1") {
    const [getNodes, setNodes] = createState<CanvasNodeData[]>([sourceNode]);
    const [getConnections, setConnections] = createState<CanvasConnection[]>([]);
    const setPendingChildIds = vi.fn();
    const addAsset = vi.fn(() => "asset-panorama");

    await generateCanvasImage(
        {
            nodeId: sourceNode.id,
            prompt: "环形展厅",
            effectivePrompt: "环形展厅，晨光",
            sourceNode,
            generationConfig: imageGenerationConfig(count),
            generationContext: generationContext(),
            setPendingChildIds,
        },
        {
            nodes: getNodes(),
            connections: getConnections(),
            setNodes,
            setConnections,
            setSelectedNodeIds: vi.fn(),
            setSelectedConnectionId: vi.fn(),
            setDialogNodeId: vi.fn(),
            message: { error: vi.fn(), warning: vi.fn() },
            canvasId: "canvas-1",
            addAsset,
        },
    );

    return { nodes: getNodes(), connections: getConnections(), setPendingChildIds, addAsset };
}

describe("canvas image generation hook branch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("uses final panorama prompt, config, metadata, and asset context for config node generation", async () => {
        const result = await generateFromSource(node(CanvasNodeType.Config, { panorama: true }));
        const generated = result.nodes.find((item) => item.type === CanvasNodeType.Image);
        const requestedPrompt = vi.mocked(requestGeneration).mock.calls[0][1];

        expect(requestedPrompt).toContain("环形展厅，晨光");
        expect(requestedPrompt).toContain("等距矩形 360 全景图");
        expect(requestGeneration).toHaveBeenCalledWith(expect.objectContaining({ size: "2:1", count: "1" }), requestedPrompt);
        expect(uploadImage).toHaveBeenCalledWith("data:image/png;base64,GEN");
        expect(result.addAsset).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ prompt: requestedPrompt, size: "2:1" }) }));
        expect(result.nodes.find((item) => item.id === "config-1")?.metadata).toMatchObject({ prompt: requestedPrompt, panorama: true, status: "success" });
        expect(generated?.metadata).toMatchObject({ prompt: requestedPrompt, size: "2:1", panorama: true, status: "success", primaryImageId: generated?.id });
    });

    it("fills an empty panorama image node without dropping node-level intent", async () => {
        const result = await generateFromSource(node(CanvasNodeType.Image, { panorama: true }), "2");
        const root = result.nodes.find((item) => item.id === "image-1");
        const child = result.nodes.find((item) => item.id !== "image-1");
        const requestedPrompt = vi.mocked(requestGeneration).mock.calls[0][1];

        expect(requestGeneration).toHaveBeenCalledWith(expect.objectContaining({ size: "2:1", count: "1" }), requestedPrompt);
        expect(root?.metadata).toMatchObject({ prompt: requestedPrompt, size: "2:1", panorama: true, status: "success", isBatchRoot: true, primaryImageId: child?.id });
        expect(child?.metadata).toMatchObject({ prompt: requestedPrompt, size: "2:1", panorama: true, status: "success", batchRootId: "image-1" });
    });

    it("keeps panorama intent when an existing image node starts image-to-image generation", async () => {
        const result = await generateFromSource(node(CanvasNodeType.Image, { content: "blob:source", storageKey: "image:source", mimeType: "image/png", panorama: true }));
        const generated = result.nodes.find((item) => item.id !== "image-1");
        const requestedPrompt = vi.mocked(requestEdit).mock.calls[0][1];

        expect(requestEdit).toHaveBeenCalledWith(expect.objectContaining({ size: "2:1", count: "1" }), requestedPrompt, [expect.objectContaining({ dataUrl: "blob:source", storageKey: "image:source" })]);
        expect(result.nodes.find((item) => item.id === "image-1")?.metadata).toMatchObject({ content: "blob:source", panorama: true, status: "success" });
        expect(generated?.metadata).toMatchObject({ prompt: requestedPrompt, size: "2:1", panorama: true, status: "success", primaryImageId: generated?.id });
    });
});
