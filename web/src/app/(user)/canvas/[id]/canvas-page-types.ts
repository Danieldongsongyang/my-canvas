import type { CanvasBackgroundMode } from "@/lib/canvas-theme";

import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, CanvasNodeGroup, ConnectionHandle, Position } from "../types";

export type CanvasClipboard = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

export type PendingConnectionCreate = {
    connection: ConnectionHandle;
    position: Position;
    placeByHandle?: boolean;
};

export type AddNodesMenuState = {
    x: number;
    y: number;
    position: Position;
};

export type ConnectionDropTarget = {
    nodeId: string | null;
    isNearNode: boolean;
};

export type CanvasHistoryEntry = Pick<CanvasClipboard, "nodes" | "connections"> & {
    groups: CanvasNodeGroup[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
};
