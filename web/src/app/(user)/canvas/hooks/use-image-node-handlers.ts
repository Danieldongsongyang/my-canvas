import { nanoid } from "nanoid";

import type { AiConfig } from "@/stores/use-config-store";
import { applyCanvasImageWorkflowToGraph } from "../utils/canvas-graph-mutations";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";

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

export function useImageNodeHandlers({ nodesRef, connectionsRef, setNodes, setConnections, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId, effectiveConfig }: UseImageNodeHandlersOptions) {
    const handleImageToImage = (node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Image) return;
        const sourceNode = nodesRef.current.find((item) => item.id === node.id);
        if (!sourceNode || sourceNode.type !== CanvasNodeType.Image) return;

        addWorkflowNode({
            sourceNode,
            workflow: "image-to-image",
            nodesRef,
            connectionsRef,
            setNodes,
            setConnections,
            setSelectedNodeIds,
            setSelectedConnectionId,
            setDialogNodeId,
            effectiveConfig,
        });
    };

    const handleImageToVideo = (node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Image) return;
        const sourceNode = nodesRef.current.find((item) => item.id === node.id);
        if (!sourceNode || sourceNode.type !== CanvasNodeType.Image) return;

        addWorkflowNode({
            sourceNode,
            workflow: "image-to-video",
            nodesRef,
            connectionsRef,
            setNodes,
            setConnections,
            setSelectedNodeIds,
            setSelectedConnectionId,
            setDialogNodeId,
            effectiveConfig,
        });
    };

    return {
        handleImageToImage,
        handleImageToVideo,
    };
}

function addWorkflowNode({
    sourceNode,
    workflow,
    nodesRef,
    connectionsRef,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setDialogNodeId,
    effectiveConfig,
}: {
    sourceNode: CanvasNodeData;
    workflow: "image-to-image" | "image-to-video";
    nodesRef: { current: CanvasNodeData[] };
    connectionsRef: { current: CanvasConnection[] };
    setNodes: (nodes: CanvasNodeData[]) => void;
    setConnections: (connections: CanvasConnection[]) => void;
    setSelectedNodeIds: (nodeIds: Set<string>) => void;
    setSelectedConnectionId: (connectionId: string | null) => void;
    setDialogNodeId: (nodeId: string | null) => void;
    effectiveConfig: AiConfig;
}) {
    const result = applyCanvasImageWorkflowToGraph({
        nodes: nodesRef.current,
        connections: connectionsRef.current,
        sourceNode,
        workflow,
        config: effectiveConfig,
        createNodeId: (type) => `${type}-${Date.now()}-${nanoid(6)}`,
        createConnectionId: nanoid,
    });

    nodesRef.current = result.nodes;
    connectionsRef.current = result.connections;
    setNodes(result.nodes);
    setConnections(result.connections);
    setSelectedNodeIds(result.uiState.selectedNodeIds);
    setSelectedConnectionId(result.uiState.selectedConnectionId);
    setDialogNodeId(result.uiState.dialogNodeId);
}
