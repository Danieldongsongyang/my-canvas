import { useCallback, useMemo, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { AiConfig } from "@/stores/use-config-store";

import type { CanvasProject } from "../../stores/use-canvas-store";
import type { ContextMenuState, SelectionBox } from "../../types";
import type { AddNodesMenuState } from "../canvas-page-types";
import { getGenerationCount } from "../canvas-page-utils";
import { useCanvasClipboard } from "../hooks/use-canvas-clipboard";
import { useCanvasConnections } from "../hooks/use-canvas-connections";
import { useCanvasFileNodes } from "../hooks/use-canvas-file-nodes";
import { useCanvasGroups } from "../hooks/use-canvas-groups";
import { useCanvasHistory } from "../hooks/use-canvas-history";
import { useCanvasProjectPersistence, useCanvasProjectState } from "../hooks/use-canvas-project-state";
import { useCanvasSelectionDrag } from "../hooks/use-canvas-selection-drag";
import { useCanvasViewport } from "../hooks/use-canvas-viewport";
import { useLatestCanvasRefs } from "../hooks/use-latest-canvas-refs";

type CanvasProjectPatch = Partial<Pick<CanvasProject, "nodes" | "connections" | "groups" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>;

type WorkspaceMessage = {
    success: (content: string) => void;
    warning: (content: string) => void;
};

type UseCanvasWorkspaceSessionParams = {
    project: {
        hydrated: boolean;
        projectId: string;
        openProject: (id: string) => CanvasProject | null;
        updateProject: (id: string, patch: CanvasProjectPatch) => void;
        onProjectMissing: () => void;
    };
    canvas: {
        containerRef: MutableRefObject<HTMLDivElement | null>;
        imageInputRef: MutableRefObject<HTMLInputElement | null>;
        collapsingBatchIds: Set<string>;
    };
    config: {
        effectiveConfig: AiConfig;
    };
    panels: {
        setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
        setAddNodesMenu: Dispatch<SetStateAction<AddNodesMenuState | null>>;
        setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
        setDialogNodeId: Dispatch<SetStateAction<string | null>>;
        setEditingNodeId: Dispatch<SetStateAction<string | null>>;
    };
    files: {
        cleanupAssetImages: (extra?: unknown) => void;
    };
    message: WorkspaceMessage;
};

export function useCanvasWorkspaceSession({ project, canvas, config, panels, files, message }: UseCanvasWorkspaceSessionParams) {
    const cleanupAssetImages = files.cleanupAssetImages;
    const { nodes, setNodes, connections, setConnections, groups, setGroups, chatSessions, setChatSessions, activeChatId, setActiveChatId, backgroundMode, setBackgroundMode, showImageInfo, setShowImageInfo, projectLoaded, setProjectLoaded } =
        useCanvasProjectState();
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

    const { viewport, setViewport, size, screenToCanvas, getCanvasCenter, visibleNodes, resetViewport, setZoomScale } = useCanvasViewport({
        containerRef: canvas.containerRef,
        nodes,
        collapsingBatchIds: canvas.collapsingBatchIds,
    });

    const { nodesRef, connectionsRef, selectedNodeIdsRef, viewportRef, selectionBoxRef } = useLatestCanvasRefs({
        nodes,
        connections,
        groups,
        selectedNodeIds,
        viewport,
        selectionBox,
    });

    const configNodeMetadata = useMemo(
        () => ({
            model: config.effectiveConfig.imageModel || config.effectiveConfig.model,
            size: config.effectiveConfig.size,
            count: getGenerationCount(config.effectiveConfig.canvasImageCount || config.effectiveConfig.count, config.effectiveConfig.imageModel || config.effectiveConfig.model),
        }),
        [config.effectiveConfig.canvasImageCount, config.effectiveConfig.count, config.effectiveConfig.imageModel, config.effectiveConfig.model, config.effectiveConfig.size],
    );

    const {
        selectedConnectionId,
        setSelectedConnectionId,
        connectingParams,
        connectionTargetNodeId,
        pendingConnectionCreate,
        mouseWorld,
        cancelPendingConnectionCreate,
        createConnectedNode,
        deleteConnection,
        finishConnectionDrag,
        handleConnectStart,
        openConnectionContextMenu,
        selectConnection,
        updateConnectionDrag,
        setConnecting,
    } = useCanvasConnections({
        nodesRef,
        connectionsRef,
        viewportRef,
        screenToCanvas,
        configNodeMetadata,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setContextMenu: panels.setContextMenu,
        setAddNodesMenu: panels.setAddNodesMenu,
        setDialogNodeId: panels.setDialogNodeId,
        message,
    });

    const { historyRef, lastHistoryRef, historyPausedRef, historyState, resetHistory, undoCanvas, redoCanvas } = useCanvasHistory({
        projectLoaded,
        nodes,
        connections,
        groups,
        chatSessions,
        activeChatId,
        backgroundMode,
        showImageInfo,
        setNodes,
        setConnections,
        setGroups,
        setChatSessions,
        setActiveChatId,
        setBackgroundMode,
        setShowImageInfo,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu: panels.setContextMenu,
    });

    const { isNodeDragging, nodeDraggingRef, handleCanvasMouseDown, handleNodeMouseDown, startBoundingBoxDrag } = useCanvasSelectionDrag({
        nodesRef,
        selectedNodeIdsRef,
        viewportRef,
        selectionBoxRef,
        historyPausedRef,
        pendingConnectionCreate,
        screenToCanvas,
        cancelPendingConnectionCreate,
        finishConnectionDrag,
        updateConnectionDrag,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setSelectionBox,
        setContextMenu: panels.setContextMenu,
        setAddNodesMenu: panels.setAddNodesMenu,
        setHoveredNodeId,
        setToolbarNodeId: panels.setToolbarNodeId,
        setDialogNodeId: panels.setDialogNodeId,
        setEditingNodeId: panels.setEditingNodeId,
    });

    const { getCommonGroup, groupSelectedNodes, ungroupNodes, renameGroup, sortGroupNodes } = useCanvasGroups({
        nodes,
        groups,
        nodesRef,
        selectedNodeIdsRef,
        setNodes,
        setGroups,
    });

    const cleanupCanvasFiles = useCallback(
        (extra?: unknown) => {
            cleanupAssetImages({ extra, history: historyRef.current, lastHistory: lastHistoryRef.current });
        },
        [cleanupAssetImages, historyRef, lastHistoryRef],
    );

    useCanvasProjectPersistence({
        hydrated: project.hydrated,
        projectId: project.projectId,
        openProject: project.openProject,
        updateProject: project.updateProject,
        onProjectMissing: project.onProjectMissing,
        setViewport,
        viewport,
        viewportRef,
        historyPausedRef,
        resetHistory,
        nodes,
        setNodes,
        connections,
        setConnections,
        groups,
        setGroups,
        chatSessions,
        setChatSessions,
        activeChatId,
        setActiveChatId,
        backgroundMode,
        setBackgroundMode,
        showImageInfo,
        setShowImageInfo,
        projectLoaded,
        setProjectLoaded,
    });

    const { createImageFileNode, handleUploadRequest, handleImageInputChange, handleDrop, pasteAssistantImage } = useCanvasFileNodes({
        imageInputRef: canvas.imageInputRef,
        containerRef: canvas.containerRef,
        screenToCanvas,
        size,
        nodesRef,
        connectionsRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId: panels.setDialogNodeId,
        effectiveConfig: config.effectiveConfig,
        message,
    });

    const { copyNodesToClipboard, copySelectedNodes, pasteCopiedNodes, pasteSystemClipboard } = useCanvasClipboard({
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        getCanvasCenter,
        createImageFileNode,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu: panels.setContextMenu,
        setAddNodesMenu: panels.setAddNodesMenu,
        setDialogNodeId: panels.setDialogNodeId,
        message,
    });

    return {
        nodes,
        setNodes,
        connections,
        setConnections,
        groups,
        setGroups,
        chatSessions,
        setChatSessions,
        activeChatId,
        setActiveChatId,
        backgroundMode,
        setBackgroundMode,
        showImageInfo,
        setShowImageInfo,
        projectLoaded,
        selectedNodeIds,
        setSelectedNodeIds,
        hoveredNodeId,
        setHoveredNodeId,
        selectionBox,
        setSelectionBox,
        viewport,
        setViewport,
        size,
        screenToCanvas,
        getCanvasCenter,
        visibleNodes,
        resetViewport,
        setZoomScale,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        selectedConnectionId,
        setSelectedConnectionId,
        connectingParams,
        connectionTargetNodeId,
        pendingConnectionCreate,
        mouseWorld,
        cancelPendingConnectionCreate,
        createConnectedNode,
        deleteConnection,
        handleConnectStart,
        openConnectionContextMenu,
        selectConnection,
        setConnecting,
        historyState,
        undoCanvas,
        redoCanvas,
        isNodeDragging,
        nodeDraggingRef,
        handleCanvasMouseDown,
        handleNodeMouseDown,
        startBoundingBoxDrag,
        getCommonGroup,
        groupSelectedNodes,
        ungroupNodes,
        renameGroup,
        sortGroupNodes,
        cleanupCanvasFiles,
        handleUploadRequest,
        handleImageInputChange,
        handleDrop,
        pasteAssistantImage,
        copyNodesToClipboard,
        copySelectedNodes,
        pasteCopiedNodes,
        pasteSystemClipboard,
    };
}
