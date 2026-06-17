import { useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { CanvasBackgroundMode } from "@/lib/canvas-theme";

import type { CanvasProject } from "../../stores/use-canvas-store";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, CanvasNodeGroup, ViewportTransform } from "../../types";
import type { CanvasHistoryEntry } from "../canvas-page-types";
import { hydrateAssistantImages, hydrateCanvasImages, resetInterruptedGeneration } from "../canvas-page-utils";

type CanvasProjectState = {
    nodes: CanvasNodeData[];
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    connections: CanvasConnection[];
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    groups: CanvasNodeGroup[];
    setGroups: Dispatch<SetStateAction<CanvasNodeGroup[]>>;
    chatSessions: CanvasAssistantSession[];
    setChatSessions: Dispatch<SetStateAction<CanvasAssistantSession[]>>;
    activeChatId: string | null;
    setActiveChatId: Dispatch<SetStateAction<string | null>>;
    backgroundMode: CanvasBackgroundMode;
    setBackgroundMode: Dispatch<SetStateAction<CanvasBackgroundMode>>;
    showImageInfo: boolean;
    setShowImageInfo: Dispatch<SetStateAction<boolean>>;
    projectLoaded: boolean;
    setProjectLoaded: Dispatch<SetStateAction<boolean>>;
};

type UseCanvasProjectPersistenceParams = CanvasProjectState & {
    hydrated: boolean;
    projectId: string;
    openProject: (id: string) => CanvasProject | null;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "groups" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>) => void;
    onProjectMissing: () => void;
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
    viewport: ViewportTransform;
    viewportRef: MutableRefObject<ViewportTransform>;
    historyPausedRef: MutableRefObject<boolean>;
    resetHistory: (entry: CanvasHistoryEntry) => void;
};

export function useCanvasProjectState(): CanvasProjectState {
    const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [groups, setGroups] = useState<CanvasNodeGroup[]>([]);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("lines");
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [projectLoaded, setProjectLoaded] = useState(false);

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
        setProjectLoaded,
    };
}

export function useCanvasProjectPersistence({
    hydrated,
    projectId,
    openProject,
    updateProject,
    onProjectMissing,
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
}: UseCanvasProjectPersistenceParams) {
    const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!hydrated) return;
        setProjectLoaded(false);
        const project = openProject(projectId);
        if (!project) {
            onProjectMissing();
            return;
        }

        const restore = async () => {
            const restoredNodes = await hydrateCanvasImages(resetInterruptedGeneration(project.nodes));
            const restoredSessions = await hydrateAssistantImages(project.chatSessions || []);
            setNodes(restoredNodes);
            setConnections(project.connections);
            setGroups(project.groups || []);
            setChatSessions(restoredSessions);
            setActiveChatId(project.activeChatId || null);
            setBackgroundMode(project.backgroundMode);
            setShowImageInfo(project.showImageInfo || false);
            setViewport(project.viewport);
            resetHistory({
                nodes: restoredNodes,
                connections: project.connections,
                groups: project.groups || [],
                chatSessions: restoredSessions,
                activeChatId: project.activeChatId || null,
                backgroundMode: project.backgroundMode,
                showImageInfo: project.showImageInfo || false,
            });
            setProjectLoaded(true);
        };
        void restore();
    }, [hydrated, onProjectMissing, openProject, projectId, resetHistory, setActiveChatId, setBackgroundMode, setChatSessions, setConnections, setGroups, setNodes, setProjectLoaded, setShowImageInfo, setViewport]);

    useEffect(() => {
        if (!projectLoaded || historyPausedRef.current) return;
        updateProject(projectId, { nodes, connections, groups, chatSessions, activeChatId, backgroundMode, showImageInfo });
    }, [activeChatId, backgroundMode, chatSessions, connections, groups, historyPausedRef, nodes, projectId, projectLoaded, showImageInfo, updateProject]);

    useEffect(() => {
        if (!projectLoaded) return;
        if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        viewportSaveTimerRef.current = setTimeout(() => {
            updateProject(projectId, { viewport: viewportRef.current });
            viewportSaveTimerRef.current = null;
        }, 500);
        return () => {
            if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        };
    }, [projectId, projectLoaded, updateProject, viewport, viewportRef]);
}
