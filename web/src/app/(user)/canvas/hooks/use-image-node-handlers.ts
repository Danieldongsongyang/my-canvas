import { nanoid } from "nanoid";

import type { AiConfig } from "@/stores/use-config-store";
import { getNodeSpec } from "../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "../types";

type UseImageNodeHandlersOptions = {
    nodesRef: { current: CanvasNodeData[] };
    connectionsRef: { current: CanvasConnection[] };
    setNodes: (nodes: CanvasNodeData[]) => void;
    setConnections: (connections: CanvasConnection[]) => void;
    setSelectedNodeIds: (nodeIds: Set<string>) => void;
    setSelectedConnectionId: (connectionId: string | null) => void;
    setDialogNodeId: (nodeId: string | null) => void;
    effectiveConfig: AiConfig;
};

const NODE_GAP = 96;

export function useImageNodeHandlers({
    nodesRef,
    connectionsRef,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setDialogNodeId,
    effectiveConfig,
}: UseImageNodeHandlersOptions) {
    const handleImageToImage = (node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Image) return;
        const sourceNode = nodesRef.current.find((item) => item.id === node.id);
        if (!sourceNode || sourceNode.type !== CanvasNodeType.Image) return;

        const imageNode = createWorkflowNode(CanvasNodeType.Image, sourceNode, {
            content: "",
            status: "idle",
            prompt: "",
            model: effectiveConfig.imageModel || effectiveConfig.model,
            size: effectiveConfig.size,
            quality: effectiveConfig.quality,
            count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
        });

        addWorkflowNode({
            sourceNode,
            childNode: imageNode,
            nodesRef,
            connectionsRef,
            setNodes,
            setConnections,
            setSelectedNodeIds,
            setSelectedConnectionId,
            setDialogNodeId,
        });
    };

    const handleImageToVideo = (node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Image) return;
        const sourceNode = nodesRef.current.find((item) => item.id === node.id);
        if (!sourceNode || sourceNode.type !== CanvasNodeType.Image) return;

        const videoNode = createWorkflowNode(CanvasNodeType.Video, sourceNode, {
            content: "",
            status: "idle",
            prompt: "",
            model: effectiveConfig.videoModel || effectiveConfig.model,
            size: effectiveConfig.size,
            seconds: effectiveConfig.videoSeconds,
            vquality: effectiveConfig.vquality,
            generateAudio: effectiveConfig.videoGenerateAudio,
            watermark: effectiveConfig.videoWatermark,
        });

        addWorkflowNode({
            sourceNode,
            childNode: videoNode,
            nodesRef,
            connectionsRef,
            setNodes,
            setConnections,
            setSelectedNodeIds,
            setSelectedConnectionId,
            setDialogNodeId,
        });
    };

    return {
        handleImageToImage,
        handleImageToVideo,
    };
}

function createWorkflowNode(type: CanvasNodeType.Image | CanvasNodeType.Video, sourceNode: CanvasNodeData, metadata: CanvasNodeMetadata): CanvasNodeData {
    const spec = getNodeSpec(type);
    const position: Position = {
        x: sourceNode.position.x + sourceNode.width + NODE_GAP,
        y: sourceNode.position.y + sourceNode.height / 2 - spec.height / 2,
    };

    return {
        id: `${type}-${Date.now()}-${nanoid(6)}`,
        type,
        title: spec.title,
        position,
        width: spec.width,
        height: spec.height,
        metadata: { ...spec.metadata, ...metadata },
    };
}

function getGenerationCount(count: string) {
    return Math.max(1, Math.min(15, Math.floor(Math.abs(Number(count)) || 1)));
}

function addWorkflowNode({
    sourceNode,
    childNode,
    nodesRef,
    connectionsRef,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setDialogNodeId,
}: {
    sourceNode: CanvasNodeData;
    childNode: CanvasNodeData;
    nodesRef: { current: CanvasNodeData[] };
    connectionsRef: { current: CanvasConnection[] };
    setNodes: (nodes: CanvasNodeData[]) => void;
    setConnections: (connections: CanvasConnection[]) => void;
    setSelectedNodeIds: (nodeIds: Set<string>) => void;
    setSelectedConnectionId: (connectionId: string | null) => void;
    setDialogNodeId: (nodeId: string | null) => void;
}) {
    const nextNodes: CanvasNodeData[] = nodesRef.current.map((item): CanvasNodeData => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, linkedOutputNodeId: childNode.id } } : item)).concat(childNode);
    const nextConnections = [...connectionsRef.current, { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: childNode.id }];

    nodesRef.current = nextNodes;
    connectionsRef.current = nextConnections;
    setNodes(nextNodes);
    setConnections(nextConnections);
    setSelectedNodeIds(new Set([childNode.id]));
    setSelectedConnectionId(null);
    setDialogNodeId(childNode.id);
}
