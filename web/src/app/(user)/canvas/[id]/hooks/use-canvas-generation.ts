import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { nanoid } from "nanoid";

import type { AiConfig } from "@/stores/use-config-store";

import { getNodeSpec } from "../../constants";
import type { CanvasNodeGenerationMode } from "../../components/canvas-node-prompt-panel";
import { buildNodeGenerationContext, hydrateNodeGenerationContext } from "../../components/canvas-node-generation";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { NODE_STATUS_ERROR, NODE_STATUS_LOADING, NODE_STATUS_SUCCESS, buildGenerationConfig, createCanvasNode, findRetrySourceNode, getGenerationCount, resolveMetadataReferences, sourceNodeReferenceImages } from "../canvas-page-utils";
import { generateCanvasAudio, retryCanvasAudio } from "./canvas-audio-generation";
import { generateCanvasImage, retryCanvasImage } from "./canvas-image-generation";
import { generateCanvasText, retryCanvasText } from "./canvas-text-generation";
import { generateCanvasVideo, retryCanvasVideo } from "./canvas-video-generation";
import type { CanvasGenerationMessage } from "./canvas-generation-types";

type UseCanvasGenerationParams = {
    effectiveConfig: AiConfig;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setRunningNodeId: Dispatch<SetStateAction<string | null>>;
    message: CanvasGenerationMessage;
};

export function useCanvasGeneration({
    effectiveConfig,
    isAiConfigReady,
    openConfigDialog,
    nodesRef,
    connectionsRef,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setDialogNodeId,
    setRunningNodeId,
    message,
}: UseCanvasGenerationParams) {
    const handleGenerateNode = useCallback(
        async (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => {
            const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
            const generationConfig = buildGenerationConfig(effectiveConfig, sourceNode, mode);
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            setRunningNodeId(nodeId);
            const sourceTextContent = sourceNode?.type === CanvasNodeType.Text ? sourceNode.metadata?.content?.trim() || "" : "";
            const editingTextNode = mode === "text" && Boolean(sourceTextContent);
            const generationContext = await hydrateNodeGenerationContext(
                buildNodeGenerationContext(nodeId, nodesRef.current, connectionsRef.current, editingTextNode ? `请根据要求修改以下文本。\n\n原文：\n${sourceTextContent}\n\n修改要求：\n${prompt}` : prompt),
            );
            const effectivePrompt = generationContext.prompt.trim();
            const markSourceStatus = sourceNode?.type !== CanvasNodeType.Image && !editingTextNode;
            const statusPrompt = sourceNode?.type === CanvasNodeType.Config ? effectivePrompt : prompt;
            if (!effectivePrompt && (mode === "text" || mode === "audio")) {
                setRunningNodeId(null);
                return;
            }

            let pendingChildIds: string[] = [];
            const setPendingChildIds = (ids: string[]) => {
                pendingChildIds = ids;
            };
            if (markSourceStatus) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt: statusPrompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)));

            try {
                const branchParams = { nodeId, prompt, effectivePrompt, sourceNode, generationConfig, generationContext, setPendingChildIds };
                if (mode === "image") {
                    await generateCanvasImage(branchParams, { setNodes, setConnections, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId, message });
                    return;
                }
                if (mode === "video") {
                    await generateCanvasVideo(branchParams, { setNodes, setConnections });
                    return;
                }
                if (mode === "audio") {
                    await generateCanvasAudio(branchParams, { setNodes, setConnections });
                    return;
                }
                await generateCanvasText({ ...branchParams, editingTextNode }, { setNodes, setConnections });
            } catch (error) {
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                setNodes((prev) =>
                    prev.map((node) => (node.id === nodeId || pendingChildIds.includes(node.id) ? (node.id === nodeId && !markSourceStatus ? node : { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } }) : node)),
                );
            } finally {
                setRunningNodeId(null);
            }
        },
        [connectionsRef, effectiveConfig, isAiConfigReady, message, nodesRef, openConfigDialog, setConnections, setDialogNodeId, setNodes, setRunningNodeId, setSelectedConnectionId, setSelectedNodeIds],
    );

    const handleRetryNode = useCallback(
        async (node: CanvasNodeData) => {
            const sourceNode = findRetrySourceNode(node.id, nodesRef.current, connectionsRef.current) || node;
            const batchRoot = node.metadata?.batchRootId ? nodesRef.current.find((item) => item.id === node.metadata?.batchRootId) : null;
            const savedImageMetadata = node.type === CanvasNodeType.Image ? { ...batchRoot?.metadata, ...node.metadata } : undefined;
            const hasSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
            const generationConfig =
                hasSavedImageMetadata && savedImageMetadata
                    ? {
                          ...effectiveConfig,
                          model: savedImageMetadata.model || effectiveConfig.imageModel || effectiveConfig.model,
                          quality: savedImageMetadata.quality || effectiveConfig.quality,
                          size: savedImageMetadata.size || effectiveConfig.size,
                          count: "1",
                      }
                    : { ...buildGenerationConfig(effectiveConfig, sourceNode, node.type === CanvasNodeType.Text ? "text" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const generationContext = hasSavedImageMetadata ? null : await hydrateNodeGenerationContext(buildNodeGenerationContext(sourceNode.id, nodesRef.current, connectionsRef.current, sourceNode.metadata?.prompt || node.metadata?.prompt || ""));
            const prompt = (savedImageMetadata?.prompt || generationContext?.prompt || "").trim();
            if (!prompt) {
                message.warning("找不到提示词，无法重试");
                return;
            }
            const generationType = savedImageMetadata?.generationType;
            const useReferenceImages = generationType ? generationType === "edit" : Boolean(generationContext?.referenceImages.length);
            const retryReferenceImages =
                hasSavedImageMetadata && savedImageMetadata
                    ? await resolveMetadataReferences(savedImageMetadata)
                    : useReferenceImages
                      ? generationContext?.referenceImages.length
                          ? generationContext.referenceImages
                          : sourceNodeReferenceImages(batchRoot || sourceNode)
                      : [];
            if (useReferenceImages && !retryReferenceImages) {
                message.error("参考图片已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考图片已丢失，无法继续重试" } } : item)));
                return;
            }

            setRunningNodeId(node.id);
            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : item)));

            try {
                if (node.type === CanvasNodeType.Text) {
                    if (!generationContext) return;
                    await retryCanvasText({ node, prompt, generationConfig, generationContext, setNodes });
                    return;
                }
                if (node.type === CanvasNodeType.Video) {
                    await retryCanvasVideo({
                        node,
                        prompt,
                        generationConfig,
                        retryImages: retryReferenceImages || [],
                        referenceVideos: generationContext?.referenceVideos || [],
                        referenceAudios: generationContext?.referenceAudios || [],
                        setNodes,
                    });
                    return;
                }
                if (node.type === CanvasNodeType.Audio) {
                    await retryCanvasAudio({ node, prompt, generationConfig, setNodes });
                    return;
                }
                await retryCanvasImage({
                    node,
                    prompt,
                    generationConfig,
                    retryImages: retryReferenceImages || [],
                    useReferenceImages,
                    savedImageMetadata,
                    setNodes,
                });
            } catch (error) {
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                setRunningNodeId(null);
            }
        },
        [connectionsRef, effectiveConfig, isAiConfigReady, message, nodesRef, openConfigDialog, setNodes, setRunningNodeId],
    );

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            if (!prompt) {
                message.warning("文本节点为空，无法生图");
                return;
            }
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const nodeSize = getNodeSpec(CanvasNodeType.Config);
            const configNode = createCanvasNode(
                CanvasNodeType.Config,
                {
                    x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
                    y: sourceNode.position.y + sourceNode.height / 2,
                },
                {
                    prompt: "",
                    model: effectiveConfig.imageModel || effectiveConfig.model,
                    size: effectiveConfig.size,
                    count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                },
            );
            const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: configNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(configNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
        },
        [
            connectionsRef,
            effectiveConfig.canvasImageCount,
            effectiveConfig.count,
            effectiveConfig.imageModel,
            effectiveConfig.model,
            effectiveConfig.size,
            message,
            nodesRef,
            setConnections,
            setDialogNodeId,
            setNodes,
            setSelectedConnectionId,
            setSelectedNodeIds,
        ],
    );

    return {
        handleGenerateNode,
        handleRetryNode,
        generateImageFromTextNode,
    };
}
