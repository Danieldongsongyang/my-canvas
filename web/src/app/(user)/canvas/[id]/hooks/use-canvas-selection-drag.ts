import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MouseEvent as ReactMouseEvent, MutableRefObject, PointerEvent as ReactPointerEvent, SetStateAction } from "react";

import { CanvasNodeType, type CanvasNodeData, type ContextMenuState, type Position, type SelectionBox, type ViewportTransform } from "../../types";
import { isHiddenBatchChild } from "../canvas-page-utils";
import type { AddNodesMenuState, PendingConnectionCreate } from "../canvas-page-types";

type NodeDragState = {
    isDraggingNode: boolean;
    hasMoved: boolean;
    startX: number;
    startY: number;
    initialSelectedNodes: { id: string; x: number; y: number }[];
};

type UseCanvasSelectionDragParams = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    selectedNodeIdsRef: MutableRefObject<Set<string>>;
    viewportRef: MutableRefObject<ViewportTransform>;
    selectionBoxRef: MutableRefObject<SelectionBox | null>;
    historyPausedRef: MutableRefObject<boolean>;
    pendingConnectionCreate: PendingConnectionCreate | null;
    screenToCanvas: (clientX: number, clientY: number) => Position;
    cancelPendingConnectionCreate: () => void;
    finishConnectionDrag: (clientX: number, clientY: number) => void;
    updateConnectionDrag: (clientX: number, clientY: number) => void;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setSelectionBox: Dispatch<SetStateAction<SelectionBox | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setAddNodesMenu: Dispatch<SetStateAction<AddNodesMenuState | null>>;
    setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setEditingNodeId: Dispatch<SetStateAction<string | null>>;
};

export function useCanvasSelectionDrag({
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
    setContextMenu,
    setAddNodesMenu,
    setHoveredNodeId,
    setToolbarNodeId,
    setDialogNodeId,
    setEditingNodeId,
}: UseCanvasSelectionDragParams) {
    const rafRef = useRef<number | null>(null);
    const nodeDraggingRef = useRef(false);
    const dragRef = useRef<NodeDragState>({
        isDraggingNode: false,
        hasMoved: false,
        startX: 0,
        startY: 0,
        initialSelectedNodes: [],
    });
    const [isNodeDragging, setIsNodeDragging] = useState(false);

    const startDraggingNodes = useCallback(
        (clientX: number, clientY: number, nodeIds: Set<string>) => {
            const dragIds = new Set(nodeIds);
            nodesRef.current.forEach((node) => {
                if (dragIds.has(node.id)) node.metadata?.batchChildIds?.forEach((childId) => dragIds.add(childId));
            });

            dragRef.current = {
                isDraggingNode: true,
                hasMoved: false,
                startX: clientX,
                startY: clientY,
                initialSelectedNodes: nodesRef.current.filter((node) => dragIds.has(node.id)).map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })),
            };
            historyPausedRef.current = true;
            nodeDraggingRef.current = true;
            setIsNodeDragging(true);
        },
        [historyPausedRef, nodesRef],
    );

    const startBoundingBoxDrag = useCallback(
        (event: ReactMouseEvent, nodeIds: string[]) => {
            startDraggingNodes(event.clientX, event.clientY, new Set(nodeIds));
        },
        [startDraggingNodes],
    );

    const handleCanvasMouseDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            setContextMenu(null);
            setAddNodesMenu(null);
            setDialogNodeId(null);
            setEditingNodeId(null);
            if (pendingConnectionCreate) cancelPendingConnectionCreate();
            if (event.button !== 0) return;

            const world = screenToCanvas(event.clientX, event.clientY);
            const additive = event.shiftKey;
            const nextSelectionBox = {
                startWorldX: world.x,
                startWorldY: world.y,
                currentWorldX: world.x,
                currentWorldY: world.y,
                additive,
                initialSelectedNodeIds: additive ? Array.from(selectedNodeIdsRef.current) : [],
            };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            if (!additive) setSelectedNodeIds(new Set());

            setSelectedConnectionId(null);
        },
        [cancelPendingConnectionCreate, pendingConnectionCreate, screenToCanvas, selectedNodeIdsRef, selectionBoxRef, setAddNodesMenu, setContextMenu, setDialogNodeId, setEditingNodeId, setSelectedConnectionId, setSelectedNodeIds, setSelectionBox],
    );

    const handleNodeMouseDown = useCallback(
        (event: ReactMouseEvent, nodeId: string) => {
            event.stopPropagation();
            setContextMenu(null);
            setHoveredNodeId(null);
            setToolbarNodeId(null);
            setSelectedConnectionId(null);

            const nextSelected = new Set<string>();
            if (event.shiftKey) selectedNodeIdsRef.current.forEach((id) => nextSelected.add(id));
            nextSelected.add(nodeId);

            setSelectedNodeIds(nextSelected);
            startDraggingNodes(event.clientX, event.clientY, nextSelected);
        },
        [selectedNodeIdsRef, setContextMenu, setHoveredNodeId, setSelectedConnectionId, setSelectedNodeIds, setToolbarNodeId, startDraggingNodes],
    );

    const finishNodeDrag = useCallback(
        (clientX?: number, clientY?: number) => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            if (!dragRef.current.isDraggingNode) return;

            const wasClick = !dragRef.current.hasMoved && dragRef.current.initialSelectedNodes.length === 1;
            const clickedNodeId = dragRef.current.initialSelectedNodes[0]?.id;
            const currentViewport = viewportRef.current;
            const dx = clientX == null ? 0 : (clientX - dragRef.current.startX) / currentViewport.k;
            const dy = clientY == null ? 0 : (clientY - dragRef.current.startY) / currentViewport.k;
            const initialPositions = dragRef.current.initialSelectedNodes;

            historyPausedRef.current = false;
            nodeDraggingRef.current = false;
            setIsNodeDragging(false);
            if (dragRef.current.hasMoved && clientX != null && clientY != null) {
                setNodes((prev) =>
                    prev.map((node) => {
                        const initial = initialPositions.find((item) => item.id === node.id);
                        if (!initial) return node;
                        return { ...node, position: { x: initial.x + dx, y: initial.y + dy } };
                    }),
                );
            }

            dragRef.current.isDraggingNode = false;
            dragRef.current.hasMoved = false;
            dragRef.current.initialSelectedNodes = [];
            if (wasClick && clickedNodeId) {
                const clickedNode = nodesRef.current.find((node) => node.id === clickedNodeId);
                if (clickedNode?.type === CanvasNodeType.Text) {
                    setDialogNodeId((current) => (current === clickedNodeId ? current : null));
                } else {
                    setDialogNodeId(clickedNodeId);
                }
            }
        },
        [historyPausedRef, nodesRef, setDialogNodeId, setNodes, viewportRef],
    );

    const handleGlobalMouseMove = useCallback(
        (event: MouseEvent) => {
            const currentViewport = viewportRef.current;

            if (dragRef.current.isDraggingNode) {
                const dx = (event.clientX - dragRef.current.startX) / currentViewport.k;
                const dy = (event.clientY - dragRef.current.startY) / currentViewport.k;
                const initialPositions = dragRef.current.initialSelectedNodes;
                if (Math.abs(event.clientX - dragRef.current.startX) > 3 || Math.abs(event.clientY - dragRef.current.startY) > 3) {
                    dragRef.current.hasMoved = true;
                }

                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(() => {
                    setNodes((prev) =>
                        prev.map((node) => {
                            const initial = initialPositions.find((item) => item.id === node.id);
                            return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                        }),
                    );
                    rafRef.current = null;
                });
                return;
            }

            updateConnectionDrag(event.clientX, event.clientY);
        },
        [setNodes, updateConnectionDrag, viewportRef],
    );

    const handleGlobalPointerMove = useCallback(
        (event: PointerEvent) => {
            const currentSelection = selectionBoxRef.current;
            if (!currentSelection) return;

            if (event.buttons === 0) {
                selectionBoxRef.current = null;
                setSelectionBox(null);
                return;
            }

            const world = screenToCanvas(event.clientX, event.clientY);
            const rectX = Math.min(currentSelection.startWorldX, world.x);
            const rectY = Math.min(currentSelection.startWorldY, world.y);
            const rectW = Math.abs(world.x - currentSelection.startWorldX);
            const rectH = Math.abs(world.y - currentSelection.startWorldY);
            const nextSelected = new Set<string>(currentSelection.additive ? currentSelection.initialSelectedNodeIds : []);

            nodesRef.current
                .filter((node) => !isHiddenBatchChild(node, nodesRef.current))
                .forEach((node) => {
                    const intersects = rectX < node.position.x + node.width && rectX + rectW > node.position.x && rectY < node.position.y + node.height && rectY + rectH > node.position.y;
                    if (intersects) nextSelected.add(node.id);
                });

            const nextSelectionBox = { ...currentSelection, currentWorldX: world.x, currentWorldY: world.y };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            setSelectedNodeIds(nextSelected);
        },
        [nodesRef, screenToCanvas, selectionBoxRef, setSelectedNodeIds, setSelectionBox],
    );

    const handleGlobalMouseUp = useCallback(
        (event: MouseEvent) => {
            finishNodeDrag(event.clientX, event.clientY);

            selectionBoxRef.current = null;
            setSelectionBox(null);

            finishConnectionDrag(event.clientX, event.clientY);
        },
        [finishConnectionDrag, finishNodeDrag, selectionBoxRef, setSelectionBox],
    );

    useEffect(() => {
        const handlePointerUp = (event: PointerEvent) => finishNodeDrag(event.clientX, event.clientY);
        const cancelNodeDrag = () => finishNodeDrag();
        window.addEventListener("mousemove", handleGlobalMouseMove);
        window.addEventListener("mouseup", handleGlobalMouseUp);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", cancelNodeDrag);
        window.addEventListener("blur", cancelNodeDrag);
        window.addEventListener("pointermove", handleGlobalPointerMove);
        return () => {
            window.removeEventListener("mousemove", handleGlobalMouseMove);
            window.removeEventListener("mouseup", handleGlobalMouseUp);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", cancelNodeDrag);
            window.removeEventListener("blur", cancelNodeDrag);
            window.removeEventListener("pointermove", handleGlobalPointerMove);
        };
    }, [finishNodeDrag, handleGlobalMouseMove, handleGlobalMouseUp, handleGlobalPointerMove]);

    return {
        isNodeDragging,
        nodeDraggingRef,
        handleCanvasMouseDown,
        handleNodeMouseDown,
        startBoundingBoxDrag,
    };
}
