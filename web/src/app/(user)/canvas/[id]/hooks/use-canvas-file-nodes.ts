import { useCallback, useRef } from "react";
import type { ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, Dispatch, MutableRefObject, SetStateAction } from "react";
import { nanoid } from "nanoid";

import { uploadMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";

import { NODE_DEFAULT_SIZE, getNodeSpec } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasImageWorkflowAction, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "../../types";
import { audioMetadata, isAudioFile, imageMetadata, videoMetadata, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "../canvas-page-utils";
import { fitNodeSize } from "../../utils/canvas-node-size";

type UseCanvasFileNodesParams = {
    imageInputRef: MutableRefObject<HTMLInputElement | null>;
    containerRef: MutableRefObject<HTMLDivElement | null>;
    screenToCanvas: (clientX: number, clientY: number) => Position;
    size: { width: number; height: number };
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    effectiveConfig: AiConfig;
    message: {
        success: (content: string) => void;
    };
};

export function useCanvasFileNodes({
    imageInputRef,
    containerRef,
    screenToCanvas,
    size,
    nodesRef,
    connectionsRef,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setDialogNodeId,
    effectiveConfig,
    message,
}: UseCanvasFileNodesParams) {
    const uploadTargetRef = useRef<{ nodeId?: string; position?: Position; workflow?: CanvasImageWorkflowAction } | null>(null);

    const createImageFileNode = useCallback(async (file: File, position: Position) => {
        const image = await uploadImage(file);
        const imageSize = fitNodeSize(image.width, image.height);
        const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newNode: CanvasNodeData = {
            id,
            type: CanvasNodeType.Image,
            title: file.name,
            position: { x: position.x - imageSize.width / 2, y: position.y - imageSize.height / 2 },
            width: imageSize.width,
            height: imageSize.height,
            metadata: imageMetadata(image),
        };

        setNodes((prev) => [...prev, newNode]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, [setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds]);

    const createVideoFileNode = useCallback(async (file: File, position: Position) => {
        const video = await uploadMediaFile(file, "video");
        const nextSize = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
        const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setNodes((prev) => [
            ...prev,
            {
                id,
                type: CanvasNodeType.Video,
                title: file.name,
                position: { x: position.x - nextSize.width / 2, y: position.y - nextSize.height / 2 },
                width: nextSize.width,
                height: nextSize.height,
                metadata: videoMetadata(video),
            },
        ]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, [setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds]);

    const createAudioFileNode = useCallback(async (file: File, position: Position) => {
        const audio = await uploadMediaFile(file, "audio");
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
        const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setNodes((prev) => [
            ...prev,
            {
                id,
                type: CanvasNodeType.Audio,
                title: file.name,
                position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
                width: spec.width,
                height: spec.height,
                metadata: audioMetadata(audio),
            },
        ]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
    }, [setNodes, setSelectedConnectionId, setSelectedNodeIds]);

    const handleUploadRequest = useCallback((nodeId?: string, position?: Position, workflow?: CanvasImageWorkflowAction) => {
        uploadTargetRef.current = { nodeId, position, workflow };
        imageInputRef.current?.click();
    }, [imageInputRef]);

    const handleImageInputChange = useCallback(
        async (event: ReactChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            const target = uploadTargetRef.current;
            if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/") && !isAudioFile(file))) return;

            if (target?.workflow) {
                if (!file.type.startsWith("image/")) {
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                await createWorkflowFromFile(file, { ...target, workflow: target.workflow }, {
                    nodesRef,
                    connectionsRef,
                    setNodes,
                    setConnections,
                    setSelectedNodeIds,
                    setSelectedConnectionId,
                    setDialogNodeId,
                    effectiveConfig,
                });
                uploadTargetRef.current = null;
                event.target.value = "";
                return;
            }

            if (target?.nodeId) {
                if (isAudioFile(file)) {
                    const audio = await uploadMediaFile(file, "audio");
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Audio,
                                      title: file.name,
                                      position: { x: node.position.x + node.width / 2 - spec.width / 2, y: node.position.y + node.height / 2 - spec.height / 2 },
                                      width: spec.width,
                                      height: spec.height,
                                      metadata: { ...node.metadata, ...audioMetadata(audio), errorDetails: undefined },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                if (file.type.startsWith("video/")) {
                    const video = await uploadMediaFile(file, "video");
                    const nextSize = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Video,
                                      title: file.name,
                                      position: { x: node.position.x + node.width / 2 - nextSize.width / 2, y: node.position.y + node.height / 2 - nextSize.height / 2 },
                                      width: nextSize.width,
                                      height: nextSize.height,
                                      metadata: { ...node.metadata, ...videoMetadata(video), errorDetails: undefined },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(target.nodeId);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                const image = await uploadImage(file);
                const imageSize = fitNodeSize(image.width, image.height);
                setNodes((prev) =>
                    prev.map((node) =>
                        node.id === target.nodeId
                            ? {
                                  ...node,
                                  type: CanvasNodeType.Image,
                                  title: file.name,
                                  width: imageSize.width,
                                  height: imageSize.height,
                                  metadata: {
                                      ...node.metadata,
                                      ...imageMetadata(image),
                                      errorDetails: undefined,
                                      freeResize: false,
                                      isBatchRoot: undefined,
                                      batchRootId: undefined,
                                      batchChildIds: undefined,
                                      batchUsesReferenceImages: undefined,
                                      generationType: undefined,
                                      model: undefined,
                                      size: undefined,
                                      quality: undefined,
                                      count: undefined,
                                      references: undefined,
                                      primaryImageId: undefined,
                                      imageBatchExpanded: undefined,
                                  },
                              }
                            : node,
                    ),
                );
                setSelectedNodeIds(new Set([target.nodeId]));
                setSelectedConnectionId(null);
                setDialogNodeId(target.nodeId);
            } else {
                const position = target?.position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                void (isAudioFile(file) ? createAudioFileNode(file, position) : file.type.startsWith("video/") ? createVideoFileNode(file, position) : createImageFileNode(file, position));
            }

            uploadTargetRef.current = null;
            event.target.value = "";
        },
        [connectionsRef, containerRef, createAudioFileNode, createImageFileNode, createVideoFileNode, effectiveConfig, nodesRef, screenToCanvas, setConnections, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, size.height, size.width],
    );

    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/") || item.type.startsWith("video/") || isAudioFile(item));
            if (!file) return;

            const pos = screenToCanvas(event.clientX, event.clientY);
            void (isAudioFile(file) ? createAudioFileNode(file, pos) : file.type.startsWith("video/") ? createVideoFileNode(file, pos) : createImageFileNode(file, pos));
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, screenToCanvas],
    );

    const pasteAssistantImage = useCallback(
        (file: File) => {
            const position = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            void createImageFileNode(file, position);
            message.success("已从剪切板添加图片");
        },
        [containerRef, createImageFileNode, message, screenToCanvas, size.height, size.width],
    );

    return {
        uploadTargetRef,
        createImageFileNode,
        createVideoFileNode,
        createAudioFileNode,
        handleUploadRequest,
        handleImageInputChange,
        handleDrop,
        pasteAssistantImage,
    };
}

async function createWorkflowFromFile(
    file: File,
    target: { nodeId?: string; position?: Position; workflow: CanvasImageWorkflowAction },
    deps: {
        nodesRef: MutableRefObject<CanvasNodeData[]>;
        connectionsRef: MutableRefObject<CanvasConnection[]>;
        setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
        setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
        setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
        setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
        setDialogNodeId: Dispatch<SetStateAction<string | null>>;
        effectiveConfig: AiConfig;
    },
) {
    if (!target.nodeId) return;
    const currentNode = deps.nodesRef.current.find((node) => node.id === target.nodeId);
    if (!currentNode) return;

    const image = await uploadImage(file);
    const imageSize = fitNodeSize(image.width, image.height);
    const sourceNode: CanvasNodeData = {
        ...currentNode,
        type: CanvasNodeType.Image,
        title: file.name,
        width: imageSize.width,
        height: imageSize.height,
        metadata: cleanFilledImageMetadata(currentNode.metadata, imageMetadata(image)),
    };
    const taskType = target.workflow === "image-to-video" || target.workflow === "first-frame-video" ? CanvasNodeType.Video : CanvasNodeType.Image;
    const taskNode = createWorkflowTaskNode(taskType, sourceNode, target.workflow, deps.effectiveConfig);
    const nextNodes = deps.nodesRef.current.map((node) => (node.id === sourceNode.id ? sourceNode : node)).concat(taskNode);
    const nextConnections = deps.connectionsRef.current.concat({ id: nanoid(), fromNodeId: sourceNode.id, toNodeId: taskNode.id });

    deps.nodesRef.current = nextNodes;
    deps.connectionsRef.current = nextConnections;
    deps.setNodes(nextNodes);
    deps.setConnections(nextConnections);
    deps.setSelectedNodeIds(new Set([taskNode.id]));
    deps.setSelectedConnectionId(null);
    deps.setDialogNodeId(taskNode.id);
}

function createWorkflowTaskNode(type: CanvasNodeType.Image | CanvasNodeType.Video, sourceNode: CanvasNodeData, workflow: CanvasImageWorkflowAction, config: AiConfig): CanvasNodeData {
    const spec = getNodeSpec(type);
    const metadata: CanvasNodeMetadata =
        type === CanvasNodeType.Video
            ? {
                  content: "",
                  status: "idle",
                  prompt: "",
                  model: config.videoModel || config.model,
                  size: config.size,
                  seconds: config.videoSeconds,
                  vquality: config.vquality,
                  generateAudio: config.videoGenerateAudio,
                  watermark: config.videoWatermark,
              }
            : {
                  content: "",
                  status: "idle",
                  prompt: "",
                  model: config.imageModel || config.model,
                  size: config.size,
                  quality: config.quality,
                  count: getGenerationCount(config.canvasImageCount || config.count),
              };

    return {
        id: `${type}-${Date.now()}-${nanoid(6)}`,
        type,
        title: workflowTitle(workflow, spec.title),
        position: { x: sourceNode.position.x + sourceNode.width + 96, y: sourceNode.position.y + sourceNode.height / 2 - spec.height / 2 },
        width: spec.width,
        height: spec.height,
        metadata: { ...spec.metadata, ...metadata },
    };
}

function cleanFilledImageMetadata(current: CanvasNodeMetadata | undefined, image: CanvasNodeMetadata): CanvasNodeMetadata {
    return {
        ...current,
        ...image,
        errorDetails: undefined,
        freeResize: false,
        isBatchRoot: undefined,
        batchRootId: undefined,
        batchChildIds: undefined,
        batchUsesReferenceImages: undefined,
        generationType: undefined,
        model: undefined,
        size: undefined,
        quality: undefined,
        count: undefined,
        references: undefined,
        primaryImageId: undefined,
        imageBatchExpanded: undefined,
    };
}

function workflowTitle(workflow: CanvasImageWorkflowAction, fallback: string) {
    if (workflow === "image-to-image") return "图生图";
    if (workflow === "image-to-video") return "图生视频";
    if (workflow === "image-background") return "图片换背景";
    if (workflow === "first-frame-video") return "首帧图生视频";
    return fallback;
}

function getGenerationCount(count: string) {
    return Math.max(1, Math.min(15, Math.floor(Math.abs(Number(count)) || 1)));
}
