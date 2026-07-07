import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type ContextMenuState, type Position } from "../types";

export type CanvasUploadUiState = {
    selectedNodeIds: Set<string>;
    selectedConnectionId: string | null;
    dialogNodeId: string | null;
};

export type CanvasUploadedMediaNodeType = CanvasNodeType.Image | CanvasNodeType.Video | CanvasNodeType.Audio;

export type CanvasUploadedMediaPayload = {
    type: CanvasUploadedMediaNodeType;
    title: string;
    width: number;
    height: number;
    metadata: CanvasNodeMetadata;
};

export type CanvasUploadedMediaCreatePayload = CanvasUploadedMediaPayload & {
    mode: "create";
    position: Position;
    createId?: () => string;
};

export type CanvasUploadedMediaReplacePayload = CanvasUploadedMediaPayload & {
    mode: "replace";
    nodeId: string;
};

export type CanvasUploadedMediaMutationInput = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    upload: CanvasUploadedMediaCreatePayload | CanvasUploadedMediaReplacePayload;
    uiState?: CanvasUploadUiState;
};

export type CanvasUploadedMediaMutationResult = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    nodeId: string | null;
    uiState: CanvasUploadUiState;
};

export function applyUploadedMediaToCanvasGraph({ nodes, connections, upload, uiState }: CanvasUploadedMediaMutationInput): CanvasUploadedMediaMutationResult {
    if (upload.mode === "replace") {
        const target = nodes.find((node) => node.id === upload.nodeId);
        if (!target) {
            return {
                nodes,
                connections,
                nodeId: null,
                uiState: uiState || emptyUploadUiState(),
            };
        }

        const nextNode = replaceNodeWithUploadedMedia(target, upload);
        return {
            nodes: nodes.map((node) => (node.id === upload.nodeId ? nextNode : node)),
            connections,
            nodeId: upload.nodeId,
            uiState: selectedUploadUiState(upload.nodeId, upload.type),
        };
    }

    const id = upload.createId?.() || createUploadedMediaNodeId(upload.type);
    const newNode: CanvasNodeData = {
        id,
        type: upload.type,
        title: upload.title,
        position: {
            x: upload.position.x - upload.width / 2,
            y: upload.position.y - upload.height / 2,
        },
        width: upload.width,
        height: upload.height,
        metadata: upload.metadata,
    };

    return {
        nodes: [...nodes, newNode],
        connections,
        nodeId: id,
        uiState: selectedUploadUiState(id, upload.type),
    };
}

function replaceNodeWithUploadedMedia(node: CanvasNodeData, upload: CanvasUploadedMediaReplacePayload): CanvasNodeData {
    const nextPosition =
        upload.type === CanvasNodeType.Image
            ? node.position
            : {
                  x: node.position.x + node.width / 2 - upload.width / 2,
                  y: node.position.y + node.height / 2 - upload.height / 2,
              };

    return {
        ...node,
        type: upload.type,
        title: upload.title,
        position: nextPosition,
        width: upload.width,
        height: upload.height,
        metadata: cleanUploadedMediaMetadata(node.metadata, upload.metadata, upload.type),
    };
}

function cleanUploadedMediaMetadata(current: CanvasNodeMetadata | undefined, uploaded: CanvasNodeMetadata, type: CanvasUploadedMediaNodeType): CanvasNodeMetadata {
    if (type !== CanvasNodeType.Image) {
        const { errorDetails: _errorDetails, ...rest } = current || {};
        return { ...rest, ...uploaded };
    }

    const {
        errorDetails: _errorDetails,
        isBatchRoot: _isBatchRoot,
        batchRootId: _batchRootId,
        batchChildIds: _batchChildIds,
        batchUsesReferenceImages: _batchUsesReferenceImages,
        generationType: _generationType,
        model: _model,
        size: _size,
        quality: _quality,
        count: _count,
        references: _references,
        primaryImageId: _primaryImageId,
        imageBatchExpanded: _imageBatchExpanded,
        ...rest
    } = current || {};

    return { ...rest, ...uploaded, freeResize: false };
}

function selectedUploadUiState(nodeId: string, type: CanvasUploadedMediaNodeType): CanvasUploadUiState {
    return {
        selectedNodeIds: new Set([nodeId]),
        selectedConnectionId: null,
        dialogNodeId: type === CanvasNodeType.Audio ? null : nodeId,
    };
}

function emptyUploadUiState(): CanvasUploadUiState {
    return {
        selectedNodeIds: new Set(),
        selectedConnectionId: null,
        dialogNodeId: null,
    };
}

function createUploadedMediaNodeId(type: CanvasUploadedMediaNodeType) {
    return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

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
