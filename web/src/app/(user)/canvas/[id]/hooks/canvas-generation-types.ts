import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { AiConfig } from "@/stores/use-config-store";

import type { NodeGenerationContext } from "../../components/canvas-node-generation";
import type { CanvasConnection, CanvasNodeData } from "../../types";

export type CanvasGenerationMessage = {
    error: (content: string) => void;
    warning: (content: string) => void;
};

export type CanvasGenerationRefs = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
};

export type CanvasGenerationSetters = {
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setRunningNodeId: Dispatch<SetStateAction<string | null>>;
};

export type SetPendingChildIds = (ids: string[]) => void;

export type CanvasGenerateBranchParams = {
    nodeId: string;
    prompt: string;
    effectivePrompt: string;
    sourceNode?: CanvasNodeData;
    generationConfig: AiConfig;
    generationContext: NodeGenerationContext;
    setPendingChildIds: SetPendingChildIds;
};
