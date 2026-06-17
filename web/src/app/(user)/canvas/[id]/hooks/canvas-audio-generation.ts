import { nanoid } from "nanoid";

import { requestAudioGeneration, storeGeneratedAudio } from "@/services/api/audio";
import type { AiConfig } from "@/stores/use-config-store";

import { NODE_DEFAULT_SIZE } from "../../constants";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { NODE_STATUS_LOADING, NODE_STATUS_SUCCESS, audioMetadata, buildAudioGenerationMetadata } from "../canvas-page-utils";
import type { CanvasGenerateBranchParams, CanvasGenerationSetters } from "./canvas-generation-types";

type AudioGenerationDeps = Pick<CanvasGenerationSetters, "setNodes" | "setConnections">;

export async function generateCanvasAudio(params: CanvasGenerateBranchParams, deps: AudioGenerationDeps) {
    const { nodeId, effectivePrompt, sourceNode, generationConfig, setPendingChildIds } = params;
    const { setNodes, setConnections } = deps;
    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
    const isEmptyAudioNode = sourceNode?.type === CanvasNodeType.Audio && !sourceNode.metadata?.content;
    const audioId = isEmptyAudioNode ? nodeId : nanoid();
    const parent = sourceNode?.position || { x: 0, y: 0 };
    const audioNode: CanvasNodeData = {
        id: audioId,
        type: CanvasNodeType.Audio,
        title: effectivePrompt.slice(0, 32) || "Generated Audio",
        position: isEmptyAudioNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y + ((sourceNode?.height || spec.height) - spec.height) / 2 },
        width: isEmptyAudioNode ? sourceNode.width : spec.width,
        height: isEmptyAudioNode ? sourceNode.height : spec.height,
        metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, ...buildAudioGenerationMetadata(generationConfig) },
    };
    setPendingChildIds([audioId]);
    setNodes((prev) =>
        isEmptyAudioNode ? prev.map((node) => (node.id === nodeId ? { ...node, ...audioNode } : node)) : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), audioNode],
    );
    if (!isEmptyAudioNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: audioId }]);
    await writeGeneratedAudio({ nodeId: audioId, prompt: effectivePrompt, generationConfig, setNodes });
}

export async function retryCanvasAudio(params: { node: CanvasNodeData; prompt: string; generationConfig: AiConfig; setNodes: CanvasGenerationSetters["setNodes"] }) {
    const { node, prompt, generationConfig, setNodes } = params;
    await writeGeneratedAudio({ nodeId: node.id, prompt, generationConfig, setNodes });
}

async function writeGeneratedAudio(params: { nodeId: string; prompt: string; generationConfig: AiConfig; setNodes: CanvasGenerationSetters["setNodes"] }) {
    const { nodeId, prompt, generationConfig, setNodes } = params;
    const audio = await storeGeneratedAudio(await requestAudioGeneration(generationConfig, prompt), generationConfig.audioFormat);
    setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...audioMetadata(audio), prompt, ...buildAudioGenerationMetadata(generationConfig) } } : node)));
}
