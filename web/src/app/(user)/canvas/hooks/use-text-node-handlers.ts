import { nanoid } from "nanoid";

import type { AiConfig } from "@/stores/use-config-store";
import { getNodeSpec } from "../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "../types";

type UseTextNodeHandlersOptions = {
    nodesRef: { current: CanvasNodeData[] };
    connectionsRef: { current: CanvasConnection[] };
    setNodes: (nodes: CanvasNodeData[]) => void;
    setConnections: (connections: CanvasConnection[]) => void;
    setSelectedNodeIds: (nodeIds: Set<string>) => void;
    setSelectedConnectionId: (connectionId: string | null) => void;
    requestTextEdit: (nodeId: string) => void;
    effectiveConfig: AiConfig;
};

const NODE_GAP = 96;

export function useTextNodeHandlers({
    nodesRef,
    connectionsRef,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    requestTextEdit,
    effectiveConfig,
}: UseTextNodeHandlersOptions) {
    const handleWriteTextContent = (node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Text) return;
        updateTextNode(nodesRef, setNodes, node.id, { textMode: "editing" });
        requestTextEdit(node.id);
    };

    const handleTextToImage = (node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Text) return;
        const sourceNode = nodesRef.current.find((item) => item.id === node.id);
        if (!sourceNode) return;

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
            requestTextEdit,
        });
    };

    const handleTextToVideo = (node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Text) return;
        const sourceNode = nodesRef.current.find((item) => item.id === node.id);
        if (!sourceNode) return;

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
            requestTextEdit,
        });
    };

    return {
        handleWriteTextContent,
        handleTextToImage,
        handleTextToVideo,
    };
}

function updateTextNode(nodesRef: { current: CanvasNodeData[] }, setNodes: (nodes: CanvasNodeData[]) => void, nodeId: string, metadata: Partial<CanvasNodeMetadata>) {
    const nextNodes = nodesRef.current.map((item) => (item.id === nodeId ? { ...item, metadata: { ...item.metadata, ...metadata } } : item));
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
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

function addWorkflowNode({
    sourceNode,
    childNode,
    nodesRef,
    connectionsRef,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    requestTextEdit,
}: {
    sourceNode: CanvasNodeData;
    childNode: CanvasNodeData;
    nodesRef: { current: CanvasNodeData[] };
    connectionsRef: { current: CanvasConnection[] };
    setNodes: (nodes: CanvasNodeData[]) => void;
    setConnections: (connections: CanvasConnection[]) => void;
    setSelectedNodeIds: (nodeIds: Set<string>) => void;
    setSelectedConnectionId: (connectionId: string | null) => void;
    requestTextEdit: (nodeId: string) => void;
}) {
    const nextNodes: CanvasNodeData[] = nodesRef.current
        .map((item): CanvasNodeData => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, textMode: "editing", linkedOutputNodeId: childNode.id } } : item))
        .concat(childNode);
    const nextConnections = [...connectionsRef.current, { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: childNode.id }];

    nodesRef.current = nextNodes;
    connectionsRef.current = nextConnections;
    setNodes(nextNodes);
    setConnections(nextConnections);
    setSelectedNodeIds(new Set([sourceNode.id]));
    setSelectedConnectionId(null);
    requestTextEdit(sourceNode.id);
}

function getGenerationCount(count: string) {
    return Math.max(1, Math.min(15, Math.floor(Math.abs(Number(count)) || 1)));
}
