import { describe, expect, it, vi } from "vitest";

import { registerCanvasGeneratedImageAsset, type CanvasAssetCreator } from "./canvas-asset-intake";

describe("canvas asset intake", () => {
    it("creates an image asset from materialized Canvas media and returns an assetRef metadata patch", () => {
        const addAsset: CanvasAssetCreator = vi.fn(() => "asset-1");

        const result = registerCanvasGeneratedImageAsset({
            addAsset,
            media: {
                url: "blob:canvas-image",
                storageKey: "image:canvas-image",
                width: 1024,
                height: 768,
                bytes: 1234,
                mimeType: "image/png",
            },
            context: {
                canvasId: "canvas-1",
                nodeId: "image-1",
                rootNodeId: "image-1",
                sourceNodeId: "text-1",
                prompt: "一只白色茶杯，产品摄影",
                model: "image-model",
                size: "1:1",
                quality: "auto",
                batchId: "batch-1",
                createdAt: "2026-07-03T10:00:00.000Z",
            },
        });

        expect(addAsset).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: "image",
                title: "一只白色茶杯，产品摄影",
                coverUrl: "blob:canvas-image",
                source: "Canvas Generation",
                data: {
                    dataUrl: "blob:canvas-image",
                    storageKey: "image:canvas-image",
                    width: 1024,
                    height: 768,
                    bytes: 1234,
                    mimeType: "image/png",
                },
                metadata: expect.objectContaining({
                    source: "canvas-generation",
                    canvasRole: "generated",
                    canvasId: "canvas-1",
                    nodeId: "image-1",
                    rootNodeId: "image-1",
                    sourceNodeId: "text-1",
                    prompt: "一只白色茶杯，产品摄影",
                    model: "image-model",
                    batchId: "batch-1",
                    createdAt: "2026-07-03T10:00:00.000Z",
                }),
            }),
        );
        expect(result).toEqual({
            assetId: "asset-1",
            assetRef: {
                assetId: "asset-1",
                kind: "image",
                role: "reference",
                metadata: expect.objectContaining({
                    source: "canvas-generation",
                    canvasRole: "generated",
                    storageKey: "image:canvas-image",
                    canvasId: "canvas-1",
                    nodeId: "image-1",
                }),
            },
            metadataPatch: {
                assetRef: expect.objectContaining({
                    assetId: "asset-1",
                    kind: "image",
                    role: "reference",
                }),
            },
        });
    });
});
