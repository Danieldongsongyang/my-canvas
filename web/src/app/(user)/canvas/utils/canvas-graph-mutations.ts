import type { CanvasConnection, CanvasNodeData, ContextMenuState } from "../types";

export type CanvasDeletionUiState = {
    selectedNodeIds: Set<string>;
    selectedConnectionId: string | null;
    hoveredNodeId: string | null;
    toolbarNodeId: string | null;
    dialogNodeId: string | null;
    editingNodeId: string | null;
    infoNodeId: string | null;
    cropNodeId: string | null;
    maskEditNodeId: string | null;
    splitNodeId: string | null;
    upscaleNodeId: string | null;
    superResolveNodeId: string | null;
    angleNodeId: string | null;
    previewNodeId: string | null;
    runningNodeId: string | null;
    contextMenu: ContextMenuState | null;
};

export type CanvasNodeDeletionInput = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    nodeIds: Set<string>;
    uiState?: CanvasDeletionUiState;
};

export type CanvasNodeDeletionResult = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    deletedNodeIds: Set<string>;
    uiState?: CanvasDeletionUiState;
};

export function deleteCanvasNodesFromGraph({ nodes, connections, nodeIds, uiState }: CanvasNodeDeletionInput): CanvasNodeDeletionResult {
    const deletedNodeIds = collectDeletedNodeIds(nodes, nodeIds);
    if (!deletedNodeIds.size) {
        return { nodes, connections, deletedNodeIds, uiState };
    }

    const nextNodes = removeNodesAndRepairBatchRoots(nodes, deletedNodeIds);
    const nextConnections = connections.filter((connection) => !deletedNodeIds.has(connection.fromNodeId) && !deletedNodeIds.has(connection.toNodeId));

    return {
        nodes: nextNodes,
        connections: nextConnections,
        deletedNodeIds,
        uiState: uiState ? sanitizeDeletionUiState(uiState, deletedNodeIds, new Set(nextConnections.map((connection) => connection.id))) : undefined,
    };
}

function collectDeletedNodeIds(nodes: CanvasNodeData[], nodeIds: Set<string>) {
    const deletedNodeIds = new Set(nodeIds);
    nodes.forEach((node) => {
        if (!nodeIds.has(node.id)) return;
        node.metadata?.batchChildIds?.forEach((childId) => deletedNodeIds.add(childId));
    });
    return deletedNodeIds;
}

function removeNodesAndRepairBatchRoots(nodes: CanvasNodeData[], deletedNodeIds: Set<string>) {
    const remainingNodes = nodes.filter((node) => !deletedNodeIds.has(node.id));
    return remainingNodes.map((node) => {
        const childIds = node.metadata?.batchChildIds?.filter((childId) => !deletedNodeIds.has(childId));
        if (!node.metadata?.isBatchRoot || childIds?.length === node.metadata.batchChildIds?.length) return node;

        const primaryImageId = childIds?.includes(node.metadata.primaryImageId || "") ? node.metadata.primaryImageId : childIds?.[0];
        const primaryNode = remainingNodes.find((item) => item.id === primaryImageId);
        return {
            ...node,
            metadata: {
                ...node.metadata,
                batchChildIds: childIds,
                primaryImageId,
                content: primaryNode?.metadata?.content || node.metadata.content,
                naturalWidth: primaryNode?.metadata?.naturalWidth || node.metadata.naturalWidth,
                naturalHeight: primaryNode?.metadata?.naturalHeight || node.metadata.naturalHeight,
            },
        };
    });
}

function sanitizeDeletionUiState(uiState: CanvasDeletionUiState, deletedNodeIds: Set<string>, remainingConnectionIds: Set<string>): CanvasDeletionUiState {
    return {
        selectedNodeIds: new Set(),
        selectedConnectionId: uiState.selectedConnectionId && remainingConnectionIds.has(uiState.selectedConnectionId) ? uiState.selectedConnectionId : null,
        hoveredNodeId: keepNodeId(uiState.hoveredNodeId, deletedNodeIds),
        toolbarNodeId: keepNodeId(uiState.toolbarNodeId, deletedNodeIds),
        dialogNodeId: keepNodeId(uiState.dialogNodeId, deletedNodeIds),
        editingNodeId: keepNodeId(uiState.editingNodeId, deletedNodeIds),
        infoNodeId: keepNodeId(uiState.infoNodeId, deletedNodeIds),
        cropNodeId: keepNodeId(uiState.cropNodeId, deletedNodeIds),
        maskEditNodeId: keepNodeId(uiState.maskEditNodeId, deletedNodeIds),
        splitNodeId: keepNodeId(uiState.splitNodeId, deletedNodeIds),
        upscaleNodeId: keepNodeId(uiState.upscaleNodeId, deletedNodeIds),
        superResolveNodeId: keepNodeId(uiState.superResolveNodeId, deletedNodeIds),
        angleNodeId: keepNodeId(uiState.angleNodeId, deletedNodeIds),
        previewNodeId: keepNodeId(uiState.previewNodeId, deletedNodeIds),
        runningNodeId: keepNodeId(uiState.runningNodeId, deletedNodeIds),
        contextMenu: keepContextMenu(uiState.contextMenu, deletedNodeIds, remainingConnectionIds),
    };
}

function keepNodeId(nodeId: string | null, deletedNodeIds: Set<string>) {
    return nodeId && deletedNodeIds.has(nodeId) ? null : nodeId;
}

function keepContextMenu(contextMenu: ContextMenuState | null, deletedNodeIds: Set<string>, remainingConnectionIds: Set<string>) {
    if (contextMenu?.type === "node" && deletedNodeIds.has(contextMenu.nodeId)) return null;
    if (contextMenu?.type === "connection" && !remainingConnectionIds.has(contextMenu.connectionId)) return null;
    return contextMenu;
}
