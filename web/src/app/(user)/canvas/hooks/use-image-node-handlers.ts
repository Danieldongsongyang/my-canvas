import { nanoid } from "nanoid";

import type { AiConfig } from "@/stores/use-config-store";
import { applyCanvasImageWorkflowToGraph } from "../utils/canvas-graph-mutations";
import { CanvasNodeType, type CanvasConnection, type CanvasImageWorkflowAction, type CanvasNodeData } from "../types";

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

type ImageNodeWorkflowAction = Extract<CanvasImageWorkflowAction, "image-to-image" | "image-to-video">;

export function useImageNodeHandlers({ nodesRef, connectionsRef, setNodes, setConnections, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId, effectiveConfig }: UseImageNodeHandlersOptions) {
    const startImageWorkflow = (node: CanvasNodeData, workflow: ImageNodeWorkflowAction) => {
        if (node.type !== CanvasNodeType.Image) return;
        const sourceNode = nodesRef.current.find((item) => item.id === node.id);
        if (!sourceNode || sourceNode.type !== CanvasNodeType.Image) return;

        addWorkflowNode({
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
        });
    };

    const handleImageToImage = (node: CanvasNodeData) => startImageWorkflow(node, "image-to-image");
    const handleImageToVideo = (node: CanvasNodeData) => startImageWorkflow(node, "image-to-video");

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
    workflow: ImageNodeWorkflowAction;
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
