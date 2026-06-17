import { nanoid } from "nanoid";

import { requestImageQuestion } from "@/services/api/image";

import { NODE_DEFAULT_SIZE } from "../../constants";
import { buildNodeChatMessages } from "../../components/canvas-node-generation";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { NODE_STATUS_LOADING, NODE_STATUS_SUCCESS, getGenerationCount } from "../canvas-page-utils";
import type { CanvasGenerateBranchParams, CanvasGenerationSetters } from "./canvas-generation-types";

type TextGenerationDeps = Pick<CanvasGenerationSetters, "setNodes" | "setConnections">;

export async function generateCanvasText(params: CanvasGenerateBranchParams & { editingTextNode: boolean }, deps: TextGenerationDeps) {
    const { nodeId, prompt, effectivePrompt, sourceNode, generationConfig, generationContext, editingTextNode, setPendingChildIds } = params;
    const { setNodes, setConnections } = deps;
    let streamed = "";
    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
    const textCount = isConfigNode ? getGenerationCount(generationConfig.count) : 1;
    const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : CanvasNodeType.Text];
    const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
    const childIds = isConfigNode || editingTextNode ? Array.from({ length: textCount }, () => nanoid()) : [];
    setPendingChildIds(childIds);
    if (isConfigNode || editingTextNode) {
        const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
            id,
            type: CanvasNodeType.Text,
            title: effectivePrompt.slice(0, 32) || "Generated Text",
            position: {
                x: parentPosition.x + parentConfig.width + 96,
                y: parentPosition.y + parentConfig.height / 2 - textConfig.height / 2 + (index - (textCount - 1) / 2) * (textConfig.height + 36),
            },
            width: textConfig.width,
            height: textConfig.height,
            metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, fontSize: 14 },
        }));
        setNodes((prev) => [...prev.map((node) => (node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)), ...childNodes]);
        setConnections((prev) => [...prev, ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: nodeId, toNodeId: childId }))]);
    }

    const answers = await Promise.all(
        (childIds.length ? childIds : [nodeId]).map((targetNodeId) => {
            let localStreamed = "";
            return requestImageQuestion(generationConfig, buildNodeChatMessages({ ...generationContext, prompt: effectivePrompt }), (text) => {
                localStreamed = text;
                streamed = text;
                if (isConfigNode) return;
                setNodes((prev) => prev.map((node) => (node.id === targetNodeId ? { ...node, type: CanvasNodeType.Text, metadata: { ...node.metadata, content: text, status: NODE_STATUS_LOADING } } : node)));
            }).then((answer) => ({ nodeId: targetNodeId, content: answer || localStreamed }));
        }),
    );
    const answerByNodeId = new Map(answers.map((item) => [item.nodeId, item.content]));
    setNodes((prev) =>
        prev.map((node) =>
            childIds.includes(node.id)
                ? { ...node, metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS } }
                : node.id === nodeId && isConfigNode
                  ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } }
                  : node.id === nodeId && !editingTextNode
                    ? { ...node, type: CanvasNodeType.Text, title: prompt.slice(0, 32) || "Generated Text", metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS } }
                    : node,
        ),
    );
}

export async function retryCanvasText(params: {
    node: CanvasNodeData;
    prompt: string;
    generationConfig: CanvasGenerateBranchParams["generationConfig"];
    generationContext: CanvasGenerateBranchParams["generationContext"];
    setNodes: CanvasGenerationSetters["setNodes"];
}) {
    const { node, prompt, generationConfig, generationContext, setNodes } = params;
    let streamed = "";
    const answer = await requestImageQuestion(generationConfig, buildNodeChatMessages({ ...generationContext, prompt }), (text) => {
        streamed = text;
        setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: text, status: NODE_STATUS_LOADING } } : item)));
    });
    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: answer || streamed, prompt, status: NODE_STATUS_SUCCESS } } : item)));
}
