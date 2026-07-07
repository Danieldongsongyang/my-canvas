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
    nodeIds: ReadonlySet<string>;
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

    const nextNodes = deleteNodesAndRepairBatchRoots(nodes, deletedNodeIds);
    const nextConnections = connections.filter((connection) => !deletedNodeIds.has(connection.fromNodeId) && !deletedNodeIds.has(connection.toNodeId));
    const remainingConnectionIds = new Set(nextConnections.map((connection) => connection.id));

    return {
        nodes: nextNodes,
        connections: nextConnections,
        deletedNodeIds,
        uiState: uiState ? sanitizeDeletionUiState(uiState, deletedNodeIds, remainingConnectionIds) : undefined,
    };
}

function collectDeletedNodeIds(nodes: CanvasNodeData[], nodeIds: ReadonlySet<string>): Set<string> {
    const deletedNodeIds = new Set(nodeIds);
    nodes.forEach((node) => {
        if (!nodeIds.has(node.id)) return;
        node.metadata?.batchChildIds?.forEach((childId) => deletedNodeIds.add(childId));
    });
    return deletedNodeIds;
}

function deleteNodesAndRepairBatchRoots(nodes: CanvasNodeData[], deletedNodeIds: ReadonlySet<string>): CanvasNodeData[] {
    const remainingNodes = nodes.filter((node) => !deletedNodeIds.has(node.id));
    return remainingNodes.map((node) => repairBatchRootAfterDeletion(node, remainingNodes, deletedNodeIds));
}

function repairBatchRootAfterDeletion(node: CanvasNodeData, remainingNodes: CanvasNodeData[], deletedNodeIds: ReadonlySet<string>): CanvasNodeData {
    const { metadata } = node;
    if (!metadata?.isBatchRoot || !metadata.batchChildIds) return node;

    const remainingChildIds = metadata.batchChildIds.filter((childId) => !deletedNodeIds.has(childId));
    if (remainingChildIds.length === metadata.batchChildIds.length) return node;

    const primaryImageId = getPrimaryImageIdAfterDeletion(metadata.primaryImageId, remainingChildIds);
    const primaryNode = remainingNodes.find((item) => item.id === primaryImageId);

    return {
        ...node,
        metadata: {
            ...metadata,
            batchChildIds: remainingChildIds,
            primaryImageId,
            content: primaryNode?.metadata?.content || metadata.content,
            naturalWidth: primaryNode?.metadata?.naturalWidth || metadata.naturalWidth,
            naturalHeight: primaryNode?.metadata?.naturalHeight || metadata.naturalHeight,
        },
    };
}

function getPrimaryImageIdAfterDeletion(currentPrimaryImageId: string | undefined, remainingChildIds: string[]): string | undefined {
    return remainingChildIds.includes(currentPrimaryImageId || "") ? currentPrimaryImageId : remainingChildIds[0];
}

function sanitizeDeletionUiState(uiState: CanvasDeletionUiState, deletedNodeIds: ReadonlySet<string>, remainingConnectionIds: ReadonlySet<string>): CanvasDeletionUiState {
    return {
        selectedNodeIds: new Set(),
        selectedConnectionId: keepConnectionId(uiState.selectedConnectionId, remainingConnectionIds),
        hoveredNodeId: keepNodeIdUnlessDeleted(uiState.hoveredNodeId, deletedNodeIds),
        toolbarNodeId: keepNodeIdUnlessDeleted(uiState.toolbarNodeId, deletedNodeIds),
        dialogNodeId: keepNodeIdUnlessDeleted(uiState.dialogNodeId, deletedNodeIds),
        editingNodeId: keepNodeIdUnlessDeleted(uiState.editingNodeId, deletedNodeIds),
        infoNodeId: keepNodeIdUnlessDeleted(uiState.infoNodeId, deletedNodeIds),
        cropNodeId: keepNodeIdUnlessDeleted(uiState.cropNodeId, deletedNodeIds),
        maskEditNodeId: keepNodeIdUnlessDeleted(uiState.maskEditNodeId, deletedNodeIds),
        splitNodeId: keepNodeIdUnlessDeleted(uiState.splitNodeId, deletedNodeIds),
        upscaleNodeId: keepNodeIdUnlessDeleted(uiState.upscaleNodeId, deletedNodeIds),
        superResolveNodeId: keepNodeIdUnlessDeleted(uiState.superResolveNodeId, deletedNodeIds),
        angleNodeId: keepNodeIdUnlessDeleted(uiState.angleNodeId, deletedNodeIds),
        previewNodeId: keepNodeIdUnlessDeleted(uiState.previewNodeId, deletedNodeIds),
        runningNodeId: keepNodeIdUnlessDeleted(uiState.runningNodeId, deletedNodeIds),
        contextMenu: keepContextMenu(uiState.contextMenu, deletedNodeIds, remainingConnectionIds),
    };
}

function keepConnectionId(connectionId: string | null, remainingConnectionIds: ReadonlySet<string>): string | null {
    return connectionId && remainingConnectionIds.has(connectionId) ? connectionId : null;
}

function keepNodeIdUnlessDeleted(nodeId: string | null, deletedNodeIds: ReadonlySet<string>): string | null {
    return nodeId && deletedNodeIds.has(nodeId) ? null : nodeId;
}

function keepContextMenu(contextMenu: ContextMenuState | null, deletedNodeIds: ReadonlySet<string>, remainingConnectionIds: ReadonlySet<string>): ContextMenuState | null {
    if (contextMenu?.type === "node" && deletedNodeIds.has(contextMenu.nodeId)) return null;
    if (contextMenu?.type === "connection" && !remainingConnectionIds.has(contextMenu.connectionId)) return null;
    return contextMenu;
}
