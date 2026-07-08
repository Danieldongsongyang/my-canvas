import { createLocalAssetReference, type AssetRef } from "@/services/asset-references";
import type { UploadedImage } from "@/services/image-storage";
import type { Asset } from "@/stores/use-asset-store";

import type { CanvasNodeMetadata } from "../types";

export type CanvasAssetCreator = (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => string;

export type CanvasGeneratedImageAssetContext = {
    canvasId: string;
    nodeId: string;
    rootNodeId?: string;
    sourceNodeId?: string;
    prompt?: string;
    model?: string;
    size?: string;
    quality?: string;
    batchId?: string;
    createdAt?: string;
};

export type CanvasGeneratedImageAssetInput = {
    addAsset: CanvasAssetCreator;
    media: UploadedImage;
    context: CanvasGeneratedImageAssetContext;
};

export type CanvasGeneratedImageAssetMetadataPatch = Required<Pick<CanvasNodeMetadata, "assetRef">>;

type CanvasGeneratedImageAssetMetadata = {
    source: "canvas-generation";
    canvasRole: "generated";
    canvasId: string;
    nodeId: string;
    rootNodeId?: string;
    sourceNodeId?: string;
    prompt?: string;
    model?: string;
    size?: string;
    quality?: string;
    batchId?: string;
    createdAt?: string;
};

export type CanvasGeneratedImageAssetResult = {
    assetId: string;
    assetRef: AssetRef;
    metadataPatch: CanvasGeneratedImageAssetMetadataPatch;
};

const CANVAS_ASSET_TITLE_LIMIT = 32;

export function registerCanvasGeneratedImageAsset(input: CanvasGeneratedImageAssetInput): CanvasGeneratedImageAssetResult {
    const metadata = canvasGeneratedImageMetadata(input.context);
    const assetId = input.addAsset({
        kind: "image",
        title: generatedAssetTitle(input.context.prompt),
        coverUrl: input.media.url,
        tags: ["Canvas", "生成图片"],
        source: "Canvas Generation",
        data: {
            dataUrl: input.media.url,
            storageKey: input.media.storageKey,
            width: input.media.width,
            height: input.media.height,
            bytes: input.media.bytes,
            mimeType: input.media.mimeType,
        },
        metadata,
    });
    const assetRef = createLocalAssetReference(
        { id: assetId, kind: "image" },
        {
            metadata: {
                ...metadata,
                storageKey: input.media.storageKey,
            },
        },
    );

    return {
        assetId,
        assetRef,
        metadataPatch: { assetRef },
    };
}

function canvasGeneratedImageMetadata(context: CanvasGeneratedImageAssetContext): CanvasGeneratedImageAssetMetadata {
    return {
        source: "canvas-generation",
        canvasRole: "generated",
        canvasId: context.canvasId,
        nodeId: context.nodeId,
        rootNodeId: context.rootNodeId,
        sourceNodeId: context.sourceNodeId,
        prompt: context.prompt,
        model: context.model,
        size: context.size,
        quality: context.quality,
        batchId: context.batchId,
        createdAt: context.createdAt,
    };
}

function generatedAssetTitle(prompt: string | undefined) {
    return prompt?.trim().slice(0, CANVAS_ASSET_TITLE_LIMIT) || "Canvas 生成图片";
}
