import { nanoid } from "nanoid";

import { requestVideoGeneration, storeGeneratedVideo } from "@/services/api/video";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import type { ReferenceImage } from "@/types/image";

import { NODE_DEFAULT_SIZE } from "../../constants";
import { fitNodeSize, nodeSizeFromRatio } from "../../utils/canvas-node-size";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { NODE_STATUS_LOADING, NODE_STATUS_SUCCESS, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH, generationReferenceUrls, videoMetadata } from "../canvas-page-utils";
import type { CanvasGenerateBranchParams, CanvasGenerationSetters } from "./canvas-generation-types";

type VideoGenerationDeps = Pick<CanvasGenerationSetters, "setNodes" | "setConnections">;

export async function generateCanvasVideo(params: CanvasGenerateBranchParams, deps: VideoGenerationDeps) {
    const { nodeId, effectivePrompt, sourceNode, generationConfig, generationContext, setPendingChildIds } = params;
    const { setNodes, setConnections } = deps;
    const spec = nodeSizeFromRatio(generationConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
    const isEmptyVideoNode = sourceNode?.type === CanvasNodeType.Video && !sourceNode.metadata?.content;
    const videoId = isEmptyVideoNode ? nodeId : nanoid();
    const parent = sourceNode?.position || { x: 0, y: 0 };
    const videoNode: CanvasNodeData = {
        id: videoId,
        type: CanvasNodeType.Video,
        title: effectivePrompt.slice(0, 32) || "Generated Video",
        position: isEmptyVideoNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y },
        width: isEmptyVideoNode ? sourceNode.width : spec.width,
        height: isEmptyVideoNode ? sourceNode.height : spec.height,
        metadata: {
            prompt: effectivePrompt,
            status: NODE_STATUS_LOADING,
            model: generationConfig.model,
            size: generationConfig.size,
            seconds: generationConfig.videoSeconds,
            vquality: generationConfig.vquality,
            generateAudio: generationConfig.videoGenerateAudio,
            watermark: generationConfig.videoWatermark,
            references: generationReferenceUrls(generationContext),
        },
    };
    setPendingChildIds([videoId]);
    setNodes((prev) =>
        isEmptyVideoNode ? prev.map((node) => (node.id === nodeId ? { ...node, ...videoNode } : node)) : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), videoNode],
    );
    if (!isEmptyVideoNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: videoId }]);
    await writeGeneratedVideo({
        nodeId: videoId,
        prompt: effectivePrompt,
        generationConfig,
        referenceImages: generationContext.referenceImages,
        referenceVideos: generationContext.referenceVideos,
        referenceAudios: generationContext.referenceAudios,
        fallbackWidth: spec.width,
        fallbackHeight: spec.height,
        setNodes,
        references: generationReferenceUrls(generationContext),
    });
}

export async function retryCanvasVideo(params: {
    node: CanvasNodeData;
    prompt: string;
    generationConfig: AiConfig;
    retryImages: ReferenceImage[];
    referenceVideos: ReferenceVideo[];
    referenceAudios: ReferenceAudio[];
    setNodes: CanvasGenerationSetters["setNodes"];
}) {
    const { node, prompt, generationConfig, retryImages, referenceVideos, referenceAudios, setNodes } = params;
    await writeGeneratedVideo({
        nodeId: node.id,
        prompt,
        generationConfig,
        referenceImages: retryImages,
        referenceVideos,
        referenceAudios,
        fallbackWidth: node.width,
        fallbackHeight: node.height,
        setNodes,
    });
}

async function writeGeneratedVideo(params: {
    nodeId: string;
    prompt: string;
    generationConfig: AiConfig;
    referenceImages: ReferenceImage[];
    referenceVideos: ReferenceVideo[];
    referenceAudios: ReferenceAudio[];
    fallbackWidth: number;
    fallbackHeight: number;
    setNodes: CanvasGenerationSetters["setNodes"];
    references?: string[];
}) {
    const { nodeId, prompt, generationConfig, referenceImages, referenceVideos, referenceAudios, fallbackWidth, fallbackHeight, setNodes, references } = params;
    const video = await storeGeneratedVideo(await requestVideoGeneration(generationConfig, prompt, referenceImages, referenceVideos, referenceAudios));
    const videoSize = fitNodeSize(video.width || fallbackWidth, video.height || fallbackHeight, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
    setNodes((prev) =>
        prev.map((node) =>
            node.id === nodeId
                ? {
                      ...node,
                      width: videoSize.width,
                      height: videoSize.height,
                      position: { x: node.position.x + node.width / 2 - videoSize.width / 2, y: node.position.y + node.height / 2 - videoSize.height / 2 },
                      metadata: {
                          ...node.metadata,
                          ...videoMetadata(video),
                          prompt,
                          model: generationConfig.model,
                          size: generationConfig.size,
                          seconds: generationConfig.videoSeconds,
                          vquality: generationConfig.vquality,
                          generateAudio: generationConfig.videoGenerateAudio,
                          watermark: generationConfig.videoWatermark,
                          references: references ?? node.metadata?.references,
                      },
                  }
                : node,
        ),
    );
}
