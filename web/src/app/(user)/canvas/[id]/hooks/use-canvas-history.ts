import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { CanvasBackgroundMode } from "@/lib/canvas-theme";

import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, CanvasNodeGroup, ContextMenuState } from "../../types";
import type { CanvasHistoryEntry } from "../canvas-page-types";

type UseCanvasHistoryParams = {
    projectLoaded: boolean;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    groups: CanvasNodeGroup[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setGroups: Dispatch<SetStateAction<CanvasNodeGroup[]>>;
    setChatSessions: Dispatch<SetStateAction<CanvasAssistantSession[]>>;
    setActiveChatId: Dispatch<SetStateAction<string | null>>;
    setBackgroundMode: Dispatch<SetStateAction<CanvasBackgroundMode>>;
    setShowImageInfo: Dispatch<SetStateAction<boolean>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
};

export function useCanvasHistory({
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
    setContextMenu,
}: UseCanvasHistoryParams) {
    const historyRef = useRef<{ past: CanvasHistoryEntry[]; future: CanvasHistoryEntry[] }>({ past: [], future: [] });
    const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
    const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const applyHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const applyingHistoryRef = useRef(false);
    const historyPausedRef = useRef(false);
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

    const createHistoryEntry = useCallback(
        (): CanvasHistoryEntry => ({
            nodes,
            connections,
            groups,
            chatSessions,
            activeChatId,
            backgroundMode,
            showImageInfo,
        }),
        [activeChatId, backgroundMode, chatSessions, connections, groups, nodes, showImageInfo],
    );

    const clearTimers = useCallback(() => {
        if (historyCommitTimerRef.current) {
            clearTimeout(historyCommitTimerRef.current);
            historyCommitTimerRef.current = null;
        }
        if (applyHistoryTimerRef.current) {
            clearTimeout(applyHistoryTimerRef.current);
            applyHistoryTimerRef.current = null;
        }
    }, []);

    const resetHistory = useCallback(
        (entry: CanvasHistoryEntry) => {
            clearTimers();
            historyRef.current = { past: [], future: [] };
            lastHistoryRef.current = entry;
            applyingHistoryRef.current = false;
            historyPausedRef.current = false;
            setHistoryState({ canUndo: false, canRedo: false });
        },
        [clearTimers],
    );

    useEffect(() => {
        if (!projectLoaded || applyingHistoryRef.current || historyPausedRef.current) return;
        const next = createHistoryEntry();
        const previous = lastHistoryRef.current;
        if (
            previous?.nodes === next.nodes &&
            previous.connections === next.connections &&
            previous.groups === next.groups &&
            previous.chatSessions === next.chatSessions &&
            previous.activeChatId === next.activeChatId &&
            previous.backgroundMode === next.backgroundMode &&
            previous.showImageInfo === next.showImageInfo
        )
            return;

        if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = setTimeout(() => {
            const current = createHistoryEntry();
            const last = lastHistoryRef.current;
            if (!last) return;
            historyRef.current.past = [...historyRef.current.past.slice(-49), last];
            historyRef.current.future = [];
            setHistoryState({ canUndo: true, canRedo: false });
            lastHistoryRef.current = current;
            historyCommitTimerRef.current = null;
        }, 180);

        return () => {
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
        };
    }, [activeChatId, backgroundMode, chatSessions, connections, createHistoryEntry, groups, nodes, projectLoaded, showImageInfo]);

    const applyHistory = useCallback(
        (entry: CanvasHistoryEntry) => {
            clearTimers();
            applyingHistoryRef.current = true;
            setNodes(entry.nodes);
            setConnections(entry.connections);
            setGroups(entry.groups);
            setChatSessions(entry.chatSessions);
            setActiveChatId(entry.activeChatId);
            setBackgroundMode(entry.backgroundMode);
            setShowImageInfo(entry.showImageInfo);
            setSelectedNodeIds(new Set());
            setSelectedConnectionId(null);
            setContextMenu(null);
            applyHistoryTimerRef.current = setTimeout(() => {
                lastHistoryRef.current = entry;
                applyingHistoryRef.current = false;
                setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
                applyHistoryTimerRef.current = null;
            });
        },
        [clearTimers, setActiveChatId, setBackgroundMode, setChatSessions, setConnections, setContextMenu, setGroups, setNodes, setSelectedConnectionId, setSelectedNodeIds, setShowImageInfo],
    );

    const undoCanvas = useCallback(() => {
        const previous = historyRef.current.past.pop();
        const current = lastHistoryRef.current;
        if (!previous || !current) return;
        historyRef.current.future.push(current);
        applyHistory(previous);
    }, [applyHistory]);

    const redoCanvas = useCallback(() => {
        const next = historyRef.current.future.pop();
        const current = lastHistoryRef.current;
        if (!next || !current) return;
        historyRef.current.past.push(current);
        applyHistory(next);
    }, [applyHistory]);

    useEffect(() => clearTimers, [clearTimers]);

    return {
        historyRef,
        lastHistoryRef,
        historyPausedRef,
        historyState,
        resetHistory,
        undoCanvas,
        redoCanvas,
    };
}
