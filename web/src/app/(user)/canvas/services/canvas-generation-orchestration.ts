import { nanoid } from "nanoid";

import { requestEdit, requestGeneration } from "@/services/api/image";
import type { UploadedImage } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import { normalizeImageGenerationCount } from "@/lib/image-generation-limits";

import { NODE_DEFAULT_SIZE } from "../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasImageGenerationType, type CanvasNodeData, type CanvasNodeMetadata } from "../types";
import { applyCanvasImageGenerationError, applyCanvasImageGenerationStart, applyCanvasImageGenerationSuccess, completeCanvasImageGeneration, type CanvasGenerationUiState } from "../utils/canvas-graph-mutations";
import { fitNodeSize } from "../utils/canvas-node-size";
import { buildImageGenerationMetadata, getGenerationCount, imageMetadata, NODE_STATUS_LOADING, NODE_STATUS_SUCCESS } from "../[id]/canvas-page-utils";
import { registerCanvasGeneratedImageAsset, type CanvasAssetCreator, type CanvasGeneratedImageAssetMetadataPatch } from "./canvas-asset-intake";
import { materializeCanvasImageMedia, type CanvasNodeMediaAdapter } from "./canvas-node-media";

export type CanvasImageGenerationRequester = {
    generate: (config: AiConfig, prompt: string) => Promise<Array<{ dataUrl: string }>>;
    edit: (config: AiConfig, prompt: string, references: ReferenceImage[]) => Promise<Array<{ dataUrl: string }>>;
};

export type CanvasTextToImageGenerationInput = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    sourceNodeId: string;
    prompt: string;
    effectivePrompt: string;
    generationConfig: AiConfig;
    referenceImages: ReferenceImage[];
    createId?: () => string;
    createConnectionId?: () => string;
    onStart?: (state: CanvasTextToImageGenerationStartState) => void;
    requester?: CanvasImageGenerationRequester;
    mediaAdapter?: CanvasNodeMediaAdapter;
    assetIntake?: CanvasGenerationAssetIntakeAdapter;
};

export type CanvasTextToImageGenerationStartState = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    rootNodeId: string;
    targetNodeIds: string[];
    pendingNodeIds: string[];
    uiState: CanvasGenerationUiState;
};

export type CanvasTextToImageGenerationResult = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    rootNodeId: string;
    targetNodeIds: string[];
    pendingNodeIds: string[];
    hasSuccess: boolean;
    hasFailure: boolean;
    uiState: CanvasGenerationUiState;
};

export type CanvasGeneratedImageRetryInput = {
    nodes: CanvasNodeData[];
    node: CanvasNodeData;
    prompt: string;
    generationConfig: AiConfig;
    retryImages: ReferenceImage[];
    useReferenceImages: boolean;
    savedImageMetadata?: CanvasNodeMetadata;
    requester?: CanvasImageGenerationRequester;
    mediaAdapter?: CanvasNodeMediaAdapter;
    assetIntake?: CanvasGenerationAssetIntakeAdapter;
};

export type CanvasGenerationAssetIntakeAdapter = {
    canvasId: string;
    addAsset: CanvasAssetCreator;
    now?: () => string;
};

type CanvasGeneratedImageAssetPatchInput = {
    assetIntake?: CanvasGenerationAssetIntakeAdapter;
    media: UploadedImage;
    nodeId: string;
    rootNodeId: string;
    sourceNodeId?: string;
    prompt: string;
    generationConfig: AiConfig;
    batchId?: string;
};

const defaultCanvasImageGenerationRequester: CanvasImageGenerationRequester = {
    generate: requestGeneration,
    edit: requestEdit,
};

const GENERATED_IMAGE_TITLE_LENGTH = 32;
const TEXT_TO_IMAGE_GAP = 96;
const BATCH_CHILD_OFFSET = 120;
const BATCH_CHILD_GAP = 36;

export async function generateCanvasTextToImage(input: CanvasTextToImageGenerationInput): Promise<CanvasTextToImageGenerationResult> {
    const requester = input.requester || defaultCanvasImageGenerationRequester;
    const sourceNode = input.nodes.find((node) => node.id === input.sourceNodeId);
    const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const count = normalizeImageGenerationCount(input.generationConfig.count, input.generationConfig.model || input.generationConfig.imageModel);
    const rootNodeId = createCanvasGenerationId(input.createId);
    const childNodeIds = createBatchChildNodeIds(count, input.createId);
    const targetNodeIds = count > 1 ? childNodeIds : [rootNodeId];
    const rootNode = createRootImageNode({
        id: rootNodeId,
        sourceNode,
        prompt: input.effectivePrompt,
        count,
        childNodeIds,
        referenceImages: input.referenceImages,
        generationConfig: input.generationConfig,
    });
    const childNodes = childNodeIds.map((id, index) =>
        createChildImageNode({
            id,
            index,
            rootNode,
            prompt: input.effectivePrompt,
            generationConfig: input.generationConfig,
            referenceImages: input.referenceImages,
        }),
    );
    const generationStart = applyCanvasImageGenerationStart({
        nodes: input.nodes,
        connections: input.connections,
        sourceNodeId: input.sourceNodeId,
        sourcePatch: {
            type: CanvasNodeType.Text,
            title: input.prompt.slice(0, 32) || "Prompt",
            width: textConfig.width,
            height: textConfig.height,
            metadata: { content: input.prompt, prompt: input.prompt, status: NODE_STATUS_SUCCESS, fontSize: 14, errorDetails: undefined },
        },
        generatedNodes: [rootNode, ...childNodes],
        generatedConnections: [
            { id: createCanvasGenerationId(input.createConnectionId), fromNodeId: input.sourceNodeId, toNodeId: rootNodeId },
            ...childNodeIds.map((childNodeId) => ({ id: createCanvasGenerationId(input.createConnectionId), fromNodeId: rootNodeId, toNodeId: childNodeId })),
        ],
        dialogNodeId: input.sourceNodeId,
    });
    const pendingNodeIds = [rootNodeId, ...childNodeIds];
    input.onStart?.({
        nodes: generationStart.nodes,
        connections: generationStart.connections,
        rootNodeId,
        targetNodeIds,
        pendingNodeIds,
        uiState: generationStart.uiState,
    });

    let nodes = generationStart.nodes;
    let hasSuccess = false;
    let hasFailure = false;

    await Promise.all(
        targetNodeIds.map(async (targetNodeId) => {
            try {
                const image = await requestOneImage({ requester, config: input.generationConfig, prompt: input.effectivePrompt, referenceImages: input.referenceImages });
                const uploaded = await materializeCanvasImageMedia({ dataUrl: image.dataUrl }, input.mediaAdapter);
                const imageSize = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                const assetMetadataPatch = registerGeneratedImageAssetPatch({
                    assetIntake: input.assetIntake,
                    media: uploaded,
                    nodeId: targetNodeId,
                    rootNodeId,
                    sourceNodeId: input.sourceNodeId,
                    prompt: input.effectivePrompt,
                    generationConfig: input.generationConfig,
                    batchId: count > 1 ? rootNodeId : undefined,
                });
                nodes = applyCanvasImageGenerationSuccess({
                    nodes,
                    rootNodeId,
                    targetNodeId,
                    width: imageSize.width,
                    height: imageSize.height,
                    metadata: { ...imageMetadata(uploaded), ...assetMetadataPatch },
                });
                hasSuccess = true;
            } catch (error) {
                hasFailure = true;
                nodes = applyCanvasImageGenerationError(nodes, targetNodeId, errorMessage(error));
            }
        }),
    );

    nodes = completeCanvasImageGeneration(nodes, rootNodeId, hasSuccess);

    return {
        nodes,
        connections: generationStart.connections,
        rootNodeId,
        targetNodeIds,
        pendingNodeIds,
        hasSuccess,
        hasFailure,
        uiState: generationStart.uiState,
    };
}

export async function retryCanvasGeneratedImage(input: CanvasGeneratedImageRetryInput): Promise<CanvasNodeData[]> {
    const requester = input.requester || defaultCanvasImageGenerationRequester;
    const image = await requestOneImage({ requester, config: input.generationConfig, prompt: input.prompt, referenceImages: input.useReferenceImages ? input.retryImages : [] });
    const uploadedImage = await materializeCanvasImageMedia({ dataUrl: image.dataUrl }, input.mediaAdapter);
    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const imageSize = fitNodeSize(uploadedImage.width, uploadedImage.height, imageConfig.width, imageConfig.height);
    const generationMetadata = retryGenerationMetadata(input);
    const rootNodeId = input.node.metadata?.batchRootId || input.node.id;
    const assetMetadataPatch = registerGeneratedImageAssetPatch({
        assetIntake: input.assetIntake,
        media: uploadedImage,
        nodeId: input.node.id,
        rootNodeId,
        prompt: input.prompt,
        generationConfig: input.generationConfig,
    });

    return applyCanvasImageGenerationSuccess({
        nodes: input.nodes,
        rootNodeId,
        targetNodeId: input.node.id,
        width: imageSize.width,
        height: imageSize.height,
        metadata: { ...imageMetadata(uploadedImage), prompt: input.prompt, ...generationMetadata, ...assetMetadataPatch },
    });
}

function registerGeneratedImageAssetPatch(input: CanvasGeneratedImageAssetPatchInput): Partial<CanvasGeneratedImageAssetMetadataPatch> {
    if (!input.assetIntake) return {};

    return registerCanvasGeneratedImageAsset({
        addAsset: input.assetIntake.addAsset,
        media: input.media,
        context: {
            canvasId: input.assetIntake.canvasId,
            nodeId: input.nodeId,
            rootNodeId: input.rootNodeId,
            sourceNodeId: input.sourceNodeId,
            prompt: input.prompt,
            model: input.generationConfig.model || input.generationConfig.imageModel,
            size: input.generationConfig.size,
            quality: input.generationConfig.quality,
            batchId: input.batchId,
            createdAt: input.assetIntake.now?.() || new Date().toISOString(),
        },
    }).metadataPatch;
}

function createRootImageNode(params: { id: string; sourceNode?: CanvasNodeData; prompt: string; count: number; childNodeIds: string[]; generationConfig: AiConfig; referenceImages: ReferenceImage[] }): CanvasNodeData {
    const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const sourcePosition = params.sourceNode?.position || { x: 0, y: 0 };

    return {
        id: params.id,
        type: CanvasNodeType.Image,
        title: generatedImageTitle(params.prompt),
        position: {
            x: sourcePosition.x + textConfig.width + TEXT_TO_IMAGE_GAP,
            y: sourcePosition.y + textConfig.height / 2 - imageConfig.height / 2,
        },
        width: imageConfig.width,
        height: imageConfig.height,
        metadata: {
            prompt: params.prompt,
            status: NODE_STATUS_LOADING,
            isBatchRoot: params.count > 1,
            batchChildIds: params.count > 1 ? params.childNodeIds : undefined,
            batchUsesReferenceImages: params.referenceImages.length > 0,
            ...buildImageGenerationMetadata(generationTypeForReferences(params.referenceImages), params.generationConfig, params.count, params.referenceImages),
            imageBatchExpanded: params.count > 1 ? true : undefined,
        },
    };
}

function createChildImageNode(params: { id: string; index: number; rootNode: CanvasNodeData; prompt: string; generationConfig: AiConfig; referenceImages: ReferenceImage[] }): CanvasNodeData {
    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];

    return {
        id: params.id,
        type: CanvasNodeType.Image,
        title: generatedImageTitle(params.prompt),
        position: {
            x: params.rootNode.position.x + params.rootNode.width + BATCH_CHILD_OFFSET + (params.index % 2) * (imageConfig.width + BATCH_CHILD_GAP),
            y: params.rootNode.position.y + Math.floor(params.index / 2) * (imageConfig.height + BATCH_CHILD_GAP),
        },
        width: imageConfig.width,
        height: imageConfig.height,
        metadata: {
            prompt: params.prompt,
            status: NODE_STATUS_LOADING,
            batchRootId: params.rootNode.id,
            ...buildImageGenerationMetadata(generationTypeForReferences(params.referenceImages), params.generationConfig, 1, params.referenceImages),
        },
    };
}

async function requestOneImage(params: { requester: CanvasImageGenerationRequester; config: AiConfig; prompt: string; referenceImages: ReferenceImage[] }) {
    const images = params.referenceImages.length ? await params.requester.edit({ ...params.config, count: "1" }, params.prompt, params.referenceImages) : await params.requester.generate({ ...params.config, count: "1" }, params.prompt);
    const image = images[0];
    if (!image) throw new Error("生成失败");
    return image;
}

function retryGenerationMetadata(input: CanvasGeneratedImageRetryInput): CanvasNodeMetadata {
    if (input.savedImageMetadata?.generationType) {
        return {
            generationType: input.savedImageMetadata.generationType,
            model: input.generationConfig.model,
            size: input.generationConfig.size,
            quality: input.generationConfig.quality,
            count: input.savedImageMetadata.count || 1,
            references: input.savedImageMetadata.references,
        };
    }

    return buildImageGenerationMetadata(input.useReferenceImages ? "edit" : "generation", input.generationConfig, 1, input.retryImages);
}

function createBatchChildNodeIds(count: number, createId?: () => string) {
    if (count <= 1) return [];
    return Array.from({ length: count }, () => createCanvasGenerationId(createId));
}

function createCanvasGenerationId(createId?: () => string) {
    return createId?.() || nanoid();
}

function generatedImageTitle(prompt: string) {
    return prompt.slice(0, GENERATED_IMAGE_TITLE_LENGTH) || "Generated Image";
}

function generationTypeForReferences(referenceImages: ReferenceImage[]): CanvasImageGenerationType {
    return referenceImages.length ? "edit" : "generation";
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "生成失败";
}
