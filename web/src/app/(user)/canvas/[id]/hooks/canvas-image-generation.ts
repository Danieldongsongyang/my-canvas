import { nanoid } from "nanoid";

import { requestEdit, requestGeneration } from "@/services/api/image";
import { uploadImage } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

import { NODE_DEFAULT_SIZE } from "../../constants";
import { fitNodeSize } from "../../utils/canvas-node-size";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "../../types";
import { NODE_STATUS_ERROR, NODE_STATUS_LOADING, NODE_STATUS_SUCCESS, buildImageGenerationMetadata, imageMetadata } from "../canvas-page-utils";
import type { CanvasGenerateBranchParams, CanvasGenerationMessage, CanvasGenerationSetters } from "./canvas-generation-types";
import { generateCanvasTextToImage, retryCanvasGeneratedImage } from "../../services/canvas-generation-orchestration";

type ImageGenerationDeps = Pick<CanvasGenerationSetters, "setNodes" | "setConnections" | "setSelectedNodeIds" | "setSelectedConnectionId" | "setDialogNodeId"> & {
    message: CanvasGenerationMessage;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

export async function generateCanvasImage(params: CanvasGenerateBranchParams, deps: ImageGenerationDeps) {
    const { nodeId, prompt, effectivePrompt, sourceNode, generationConfig, generationContext, setPendingChildIds } = params;
    const { setNodes, setConnections, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId, message } = deps;
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(generationConfig.count)) || 1)));
    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
    const isImageNode = sourceNode?.type === CanvasNodeType.Image;
    const isEmptyImageNode = isImageNode && !sourceNode?.metadata?.content;
    const sourceReference =
        isImageNode && sourceNode?.metadata?.content
            ? [{ id: sourceNode.id, name: `${sourceNode.title || sourceNode.id}.png`, type: sourceNode.metadata.mimeType || "image/png", dataUrl: sourceNode.metadata.content, storageKey: sourceNode.metadata.storageKey }]
            : [];
    const referenceImages = sourceReference.length ? sourceReference : generationContext.referenceImages;
    const generationType = referenceImages.length ? ("edit" as const) : ("generation" as const);
    const generationMetadata = buildImageGenerationMetadata(generationType, generationConfig, count, referenceImages);

    if (!isConfigNode && !isImageNode) {
        const result = await generateCanvasTextToImage({
            nodes: deps.nodes,
            connections: deps.connections,
            sourceNodeId: nodeId,
            prompt,
            effectivePrompt,
            generationConfig,
            referenceImages,
            onStart: (state) => {
                setPendingChildIds(state.pendingNodeIds);
                setNodes(state.nodes);
                setConnections(state.connections);
                setSelectedNodeIds(state.uiState.selectedNodeIds);
                setSelectedConnectionId(state.uiState.selectedConnectionId);
                setDialogNodeId(state.uiState.dialogNodeId);
            },
        });
        setNodes(result.nodes);
        setConnections(result.connections);
        setSelectedNodeIds(result.uiState.selectedNodeIds);
        setSelectedConnectionId(result.uiState.selectedConnectionId);
        setDialogNodeId(result.uiState.dialogNodeId);
        if (result.hasFailure) message.error(result.hasSuccess ? "部分图片生成失败" : "全部图片生成失败");
        return;
    }

    const parentConfig = NODE_DEFAULT_SIZE[parentNodeTypeForImageGeneration(isConfigNode, isImageNode)];
    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
    const gap = 96;
    const rowGap = 36;
    const rootId = isEmptyImageNode ? nodeId : nanoid();
    const childIds = count > 1 ? Array.from({ length: count }, () => nanoid()) : [];
    const targetIds = count > 1 ? childIds : [rootId];
    setPendingChildIds(isEmptyImageNode ? childIds : [rootId, ...childIds]);
    const rootNode: CanvasNodeData = {
        id: rootId,
        type: CanvasNodeType.Image,
        title: effectivePrompt.slice(0, 32) || "Generated Image",
        position: {
            x: isEmptyImageNode ? parentPosition.x : parentPosition.x + parentConfig.width + gap,
            y: parentPosition.y + parentConfig.height / 2 - imageConfig.height / 2,
        },
        width: isEmptyImageNode ? sourceNode?.width || imageConfig.width : imageConfig.width,
        height: isEmptyImageNode ? sourceNode?.height || imageConfig.height : imageConfig.height,
        metadata: {
            prompt: effectivePrompt,
            status: NODE_STATUS_LOADING,
            isBatchRoot: count > 1,
            batchChildIds: count > 1 ? childIds : undefined,
            batchUsesReferenceImages: referenceImages.length > 0,
            ...generationMetadata,
            imageBatchExpanded: count > 1 ? true : undefined,
        },
    };
    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
        id,
        type: CanvasNodeType.Image,
        title: effectivePrompt.slice(0, 32) || "Generated Image",
        position: {
            x: rootNode.position.x + rootNode.width + 120 + (index % 2) * (imageConfig.width + 36),
            y: rootNode.position.y + Math.floor(index / 2) * (imageConfig.height + rowGap),
        },
        width: imageConfig.width,
        height: imageConfig.height,
        metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, batchRootId: count > 1 ? rootId : undefined, ...generationMetadata },
    }));
    const batchConnections = [...(isEmptyImageNode ? [] : [{ id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]), ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: rootId, toNodeId: childId }))];

    setNodes((prev) => [
        ...prev.map((node) => {
            if (node.id !== nodeId) return node;

            if (isConfigNode) {
                return {
                    ...node,
                    metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_LOADING, errorDetails: undefined },
                };
            }

            if (isEmptyImageNode) {
                return {
                    ...node,
                    position: rootNode.position,
                    width: rootNode.width,
                    height: rootNode.height,
                    title: rootNode.title,
                    metadata: { ...node.metadata, ...rootNode.metadata, errorDetails: undefined },
                };
            }

            if (isImageNode) {
                return {
                    ...node,
                    metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined },
                };
            }

            return {
                ...node,
                type: CanvasNodeType.Text,
                title: prompt.slice(0, 32) || "Prompt",
                width: parentConfig.width,
                height: parentConfig.height,
                metadata: { ...node.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS, fontSize: 14, errorDetails: undefined },
            };
        }),
        ...(isEmptyImageNode ? [] : [rootNode]),
        ...childNodes,
    ]);
    setConnections((prev) => [...prev, ...batchConnections]);
    setSelectedNodeIds(new Set([nodeId]));
    setSelectedConnectionId(null);
    setDialogNodeId(nodeId);

    let hasSuccess = false;
    let hasFailure = false;
    await Promise.all(
        targetIds.map(async (targetId) => {
            try {
                const image = referenceImages.length
                    ? await requestEdit({ ...generationConfig, count: "1" }, effectivePrompt, referenceImages).then((items) => items[0])
                    : await requestGeneration({ ...generationConfig, count: "1" }, effectivePrompt).then((items) => items[0]);
                const uploaded = await uploadImage(image.dataUrl);
                const imageSize = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                setNodes((prev) => {
                    const root = prev.find((node) => node.id === rootId);
                    return prev.map((node) => {
                        if (node.id !== targetId && node.id !== rootId) return node;
                        const center = { x: node.position.x + node.width / 2, y: node.position.y + node.height / 2 };
                        if (node.id === rootId && (targetId === rootId || !root?.metadata?.primaryImageId))
                            return {
                                ...node,
                                position: { x: center.x - imageSize.width / 2, y: center.y - imageSize.height / 2 },
                                width: imageSize.width,
                                height: imageSize.height,
                                metadata: { ...node.metadata, ...imageMetadata(uploaded), primaryImageId: targetId },
                            };
                        if (node.id === targetId)
                            return {
                                ...node,
                                position: { x: center.x - imageSize.width / 2, y: center.y - imageSize.height / 2 },
                                width: imageSize.width,
                                height: imageSize.height,
                                metadata: { ...node.metadata, ...imageMetadata(uploaded) },
                            };
                        return node;
                    });
                });
                hasSuccess = true;
                if (isConfigNode) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)));
                return true;
            } catch (error) {
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                hasFailure = true;
                setNodes((prev) => prev.map((node) => (node.id === targetId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node)));
                return false;
            }
        }),
    );
    if (hasFailure) message.error(hasSuccess ? "部分图片生成失败" : "全部图片生成失败");
    setNodes((prev) =>
        prev.map((node) => {
            if (node.id === nodeId && isConfigNode) {
                return { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : "全部图片生成失败" } };
            }

            if (node.id === nodeId && isEmptyImageNode) {
                return { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : "全部图片生成失败" } };
            }

            if (node.id === rootId && !hasSuccess) {
                return { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: "全部图片生成失败" } };
            }

            return node;
        }),
    );
}

function parentNodeTypeForImageGeneration(isConfigNode: boolean, isImageNode: boolean) {
    if (isConfigNode) return CanvasNodeType.Config;
    if (isImageNode) return CanvasNodeType.Image;
    return CanvasNodeType.Text;
}

export async function retryCanvasImage(params: {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    prompt: string;
    generationConfig: AiConfig;
    retryImages: ReferenceImage[];
    useReferenceImages: boolean;
    savedImageMetadata?: CanvasNodeMetadata;
    setNodes: CanvasGenerationSetters["setNodes"];
}) {
    const { node, nodes, prompt, generationConfig, retryImages, useReferenceImages, savedImageMetadata, setNodes } = params;
    const nextNodes = await retryCanvasGeneratedImage({ nodes, node, prompt, generationConfig, retryImages, useReferenceImages, savedImageMetadata });
    setNodes(nextNodes);
}
