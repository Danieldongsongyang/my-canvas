import { useCallback, useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { nanoid } from "nanoid";

import type { CanvasNodeData, CanvasNodeGroup, Position } from "../../types";

type UseCanvasGroupsParams = {
    nodes: CanvasNodeData[];
    groups: CanvasNodeGroup[];
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    selectedNodeIdsRef: MutableRefObject<Set<string>>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setGroups: Dispatch<SetStateAction<CanvasNodeGroup[]>>;
};

export function useCanvasGroups({ nodes, groups, nodesRef, selectedNodeIdsRef, setNodes, setGroups }: UseCanvasGroupsParams) {
    const getCommonGroup = useCallback(
        (nodeIds: Iterable<string>) => {
            const ids = Array.from(nodeIds);
            if (!ids.length) return undefined;

            const firstNode = nodes.find((node) => node.id === ids[0]);
            const groupId = firstNode?.groupId;
            if (!groupId) return undefined;

            const allInSameGroup = ids.every((id) => nodes.find((node) => node.id === id)?.groupId === groupId);
            if (!allInSameGroup) return undefined;

            return groups.find((group) => group.id === groupId);
        },
        [groups, nodes],
    );

    const groupSelectedNodes = useCallback(() => {
        const nodeIds = Array.from(selectedNodeIdsRef.current);
        if (nodeIds.length < 2) return;

        const groupId = nanoid();
        const newGroup: CanvasNodeGroup = {
            id: groupId,
            nodeIds,
            label: "新分组",
        };

        setGroups((prev) => [
            ...prev
                .map((group) => ({
                    ...group,
                    nodeIds: group.nodeIds.filter((id) => !nodeIds.includes(id)),
                }))
                .filter((group) => group.nodeIds.length >= 2),
            newGroup,
        ]);
        setNodes((prev) => prev.map((node) => (nodeIds.includes(node.id) ? { ...node, groupId } : node)));
    }, [selectedNodeIdsRef, setGroups, setNodes]);

    const ungroupNodes = useCallback(
        (groupId: string) => {
            setGroups((prev) => prev.filter((group) => group.id !== groupId));
            setNodes((prev) => prev.map((node) => (node.groupId === groupId ? { ...node, groupId: undefined } : node)));
        },
        [setGroups, setNodes],
    );

    const renameGroup = useCallback(
        (groupId: string, label: string) => {
            const nextLabel = label.trim();
            if (!nextLabel) return;

            setGroups((prev) => prev.map((group) => (group.id === groupId ? { ...group, label: nextLabel } : group)));
        },
        [setGroups],
    );

    const sortGroupNodes = useCallback(
        (groupId: string, direction: "horizontal" | "vertical" | "grid") => {
            const groupNodes = nodesRef.current.filter((node) => node.groupId === groupId);
            if (groupNodes.length < 2) return;

            const sortedNodes = [...groupNodes].sort((a, b) => {
                const numA = Number(a.title.match(/\d+/)?.[0] || 0);
                const numB = Number(b.title.match(/\d+/)?.[0] || 0);
                return numA - numB;
            });
            const minX = Math.min(...sortedNodes.map((node) => node.position.x));
            const minY = Math.min(...sortedNodes.map((node) => node.position.y));
            const gapX = 96;
            const gapY = 56;
            const gridColumns = 3;
            const gridCellWidth = Math.max(...sortedNodes.map((node) => node.width)) + gapX;
            const gridCellHeight = Math.max(...sortedNodes.map((node) => node.height)) + gapY;
            const updates = new Map<string, Position>();

            let nextX = minX;
            let nextY = minY;
            sortedNodes.forEach((node, index) => {
                if (direction === "horizontal") {
                    updates.set(node.id, { x: nextX, y: minY });
                    nextX += node.width + gapX;
                    return;
                }

                if (direction === "vertical") {
                    updates.set(node.id, { x: minX, y: nextY });
                    nextY += node.height + gapY;
                    return;
                }

                const col = index % gridColumns;
                const row = Math.floor(index / gridColumns);
                updates.set(node.id, {
                    x: minX + col * gridCellWidth,
                    y: minY + row * gridCellHeight,
                });
            });

            setNodes((prev) => prev.map((node) => (updates.has(node.id) ? { ...node, position: updates.get(node.id)! } : node)));
        },
        [nodesRef, setNodes],
    );

    useEffect(() => {
        let groupsChanged = false;
        const nextGroups = groups.flatMap((group) => {
            const nodeIds = nodes.filter((node) => node.groupId === group.id).map((node) => node.id);
            if (nodeIds.length < 2) {
                groupsChanged = true;
                return [];
            }
            const isSameNodeList = nodeIds.length === group.nodeIds.length && nodeIds.every((id, index) => id === group.nodeIds[index]);
            if (isSameNodeList) return [group];
            groupsChanged = true;
            return [{ ...group, nodeIds }];
        });

        if (groupsChanged) setGroups(nextGroups);

        const validGroupIds = new Set(nextGroups.map((group) => group.id));
        const hasOrphanGroupId = nodes.some((node) => node.groupId && !validGroupIds.has(node.groupId));
        if (!hasOrphanGroupId) return;

        setNodes((prev) => {
            let nodesChanged = false;
            const nextNodes = prev.map((node) => {
                if (!node.groupId || validGroupIds.has(node.groupId)) return node;
                nodesChanged = true;
                return { ...node, groupId: undefined };
            });
            return nodesChanged ? nextNodes : prev;
        });
    }, [groups, nodes, setGroups, setNodes]);

    return {
        getCommonGroup,
        groupSelectedNodes,
        ungroupNodes,
        renameGroup,
        sortGroupNodes,
    };
}
