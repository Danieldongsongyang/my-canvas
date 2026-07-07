import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData } from "../../types";
import type { CanvasDeletionUiState } from "../../utils/canvas-graph-mutations";
import { deleteCanvasNodesFromGraph } from "../../utils/canvas-graph-mutations";

type CanvasDeletionUiStateSetters = {
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
    setContextMenu: Dispatch<SetStateAction<CanvasDeletionUiState["contextMenu"]>>;
};

type UseCanvasNodeDeletionParams = CanvasDeletionUiState &
    CanvasDeletionUiStateSetters & {
        projectId: string;
        nodesRef: MutableRefObject<CanvasNodeData[]>;
        connectionsRef: MutableRefObject<CanvasConnection[]>;
        chatSessions: CanvasAssistantSession[];
        cleanupCanvasFiles: (extra?: unknown) => void;
        setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
        setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
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

            const currentUiState: CanvasDeletionUiState = {
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
            };
            const result = deleteCanvasNodesFromGraph({
                nodes: nodesRef.current,
                connections: connectionsRef.current,
                nodeIds: ids,
                uiState: currentUiState,
            });
            const nextUiState = result.uiState;

            if (!result.deletedNodeIds.size || !nextUiState) return;

            setNodes(result.nodes);
            setConnections(result.connections);
            applyDeletionUiState(nextUiState, {
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
            });
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

function applyDeletionUiState(uiState: CanvasDeletionUiState, setters: CanvasDeletionUiStateSetters) {
    setters.setSelectedNodeIds(uiState.selectedNodeIds);
    setters.setSelectedConnectionId(uiState.selectedConnectionId);
    setters.setHoveredNodeId(uiState.hoveredNodeId);
    setters.setToolbarNodeId(uiState.toolbarNodeId);
    setters.setDialogNodeId(uiState.dialogNodeId);
    setters.setEditingNodeId(uiState.editingNodeId);
    setters.setInfoNodeId(uiState.infoNodeId);
    setters.setCropNodeId(uiState.cropNodeId);
    setters.setMaskEditNodeId(uiState.maskEditNodeId);
    setters.setSplitNodeId(uiState.splitNodeId);
    setters.setUpscaleNodeId(uiState.upscaleNodeId);
    setters.setSuperResolveNodeId(uiState.superResolveNodeId);
    setters.setAngleNodeId(uiState.angleNodeId);
    setters.setPreviewNodeId(uiState.previewNodeId);
    setters.setRunningNodeId(uiState.runningNodeId);
    setters.setContextMenu(uiState.contextMenu);
}
