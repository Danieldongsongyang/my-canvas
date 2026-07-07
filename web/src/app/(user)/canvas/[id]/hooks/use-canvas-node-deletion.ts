import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ContextMenuState } from "../../types";
import { deleteCanvasNodesFromGraph } from "../../utils/canvas-graph-mutations";

type UseCanvasNodeDeletionParams = {
    projectId: string;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    chatSessions: CanvasAssistantSession[];
    cleanupCanvasFiles: (extra?: unknown) => void;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
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
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setEditingNodeId: Dispatch<SetStateAction<string | null>>;
    setInfoNodeId: Dispatch<SetStateAction<string | null>>;
    setCropNodeId: Dispatch<SetStateAction<string | null>>;
    setMaskEditNodeId: Dispatch<SetStateAction<string | null>>;
    setSplitNodeId: Dispatch<SetStateAction<string | null>>;
    setUpscaleNodeId: Dispatch<SetStateAction<string | null>>;
    setSuperResolveNodeId: Dispatch<SetStateAction<string | null>>;
    setAngleNodeId: Dispatch<SetStateAction<string | null>>;
    setPreviewNodeId: Dispatch<SetStateAction<string | null>>;
    setRunningNodeId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
};

export function useCanvasNodeDeletion(params: UseCanvasNodeDeletionParams) {
    const {
        projectId,
        nodesRef,
        connectionsRef,
        chatSessions,
        cleanupCanvasFiles,
        setNodes,
        setConnections,
        selectedNodeIds,
        selectedConnectionId,
        hoveredNodeId,
        toolbarNodeId,
        dialogNodeId,
        editingNodeId,
        infoNodeId,
        cropNodeId,
        maskEditNodeId,
        splitNodeId,
        upscaleNodeId,
        superResolveNodeId,
        angleNodeId,
        previewNodeId,
        runningNodeId,
        contextMenu,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setHoveredNodeId,
        setToolbarNodeId,
        setDialogNodeId,
        setEditingNodeId,
        setInfoNodeId,
        setCropNodeId,
        setMaskEditNodeId,
        setSplitNodeId,
        setUpscaleNodeId,
        setSuperResolveNodeId,
        setAngleNodeId,
        setPreviewNodeId,
        setRunningNodeId,
        setContextMenu,
    } = params;

    return useCallback(
        (ids: Set<string>) => {
            if (!ids.size) return;

            const result = deleteCanvasNodesFromGraph({
                nodes: nodesRef.current,
                connections: connectionsRef.current,
                nodeIds: ids,
                uiState: {
                    selectedNodeIds,
                    selectedConnectionId,
                    hoveredNodeId,
                    toolbarNodeId,
                    dialogNodeId,
                    editingNodeId,
                    infoNodeId,
                    cropNodeId,
                    maskEditNodeId,
                    splitNodeId,
                    upscaleNodeId,
                    superResolveNodeId,
                    angleNodeId,
                    previewNodeId,
                    runningNodeId,
                    contextMenu,
                },
            });

            if (!result.deletedNodeIds.size || !result.uiState) return;

            setNodes(result.nodes);
            setConnections(result.connections);
            setSelectedNodeIds(result.uiState.selectedNodeIds);
            setSelectedConnectionId(result.uiState.selectedConnectionId);
            setHoveredNodeId(result.uiState.hoveredNodeId);
            setToolbarNodeId(result.uiState.toolbarNodeId);
            setDialogNodeId(result.uiState.dialogNodeId);
            setEditingNodeId(result.uiState.editingNodeId);
            setInfoNodeId(result.uiState.infoNodeId);
            setCropNodeId(result.uiState.cropNodeId);
            setMaskEditNodeId(result.uiState.maskEditNodeId);
            setSplitNodeId(result.uiState.splitNodeId);
            setUpscaleNodeId(result.uiState.upscaleNodeId);
            setSuperResolveNodeId(result.uiState.superResolveNodeId);
            setAngleNodeId(result.uiState.angleNodeId);
            setPreviewNodeId(result.uiState.previewNodeId);
            setRunningNodeId(result.uiState.runningNodeId);
            setContextMenu(result.uiState.contextMenu);
            cleanupCanvasFiles({ projectId, nodes: result.nodes, chatSessions });
        },
        [
            projectId,
            nodesRef,
            connectionsRef,
            chatSessions,
            cleanupCanvasFiles,
            setNodes,
            setConnections,
            selectedNodeIds,
            selectedConnectionId,
            hoveredNodeId,
            toolbarNodeId,
            dialogNodeId,
            editingNodeId,
            infoNodeId,
            cropNodeId,
            maskEditNodeId,
            splitNodeId,
            upscaleNodeId,
            superResolveNodeId,
            angleNodeId,
            previewNodeId,
            runningNodeId,
            contextMenu,
            setSelectedNodeIds,
            setSelectedConnectionId,
            setHoveredNodeId,
            setToolbarNodeId,
            setDialogNodeId,
            setEditingNodeId,
            setInfoNodeId,
            setCropNodeId,
            setMaskEditNodeId,
            setSplitNodeId,
            setUpscaleNodeId,
            setSuperResolveNodeId,
            setAngleNodeId,
            setPreviewNodeId,
            setRunningNodeId,
            setContextMenu,
        ],
    );
}
