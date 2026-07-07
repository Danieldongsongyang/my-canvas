import { useCallback, useRef } from "react";
import type { ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, Dispatch, MutableRefObject, SetStateAction } from "react";
import { nanoid } from "nanoid";

import { uploadMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import { normalizeImageGenerationCount } from "@/lib/image-generation-limits";
import type { AiConfig } from "@/stores/use-config-store";

import { NODE_DEFAULT_SIZE, getNodeSpec } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasImageWorkflowAction, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "../../types";
import { applyUploadedMediaToCanvasGraph, type CanvasUploadedMediaUpload } from "../../utils/canvas-graph-mutations";
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

    const applyUploadedMediaMutation = useCallback(
        (upload: CanvasUploadedMediaUpload) => {
            const result = applyUploadedMediaToCanvasGraph({
                nodes: nodesRef.current,
                connections: connectionsRef.current,
                upload,
            });

            if (!result.nodeId) return;
            nodesRef.current = result.nodes;
            connectionsRef.current = result.connections;
            setNodes(result.nodes);
            setConnections(result.connections);
            setSelectedNodeIds(result.uiState.selectedNodeIds);
            setSelectedConnectionId(result.uiState.selectedConnectionId);
            setDialogNodeId(result.uiState.dialogNodeId);
        },
        [connectionsRef, nodesRef, setConnections, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    const createImageFileNode = useCallback(
        async (file: File, position: Position) => {
            const image = await uploadImage(file);
            const imageSize = fitNodeSize(image.width, image.height);
            applyUploadedMediaMutation({
                mode: "create",
                type: CanvasNodeType.Image,
                title: file.name,
                position,
                width: imageSize.width,
                height: imageSize.height,
                metadata: imageMetadata(image),
            });
        },
        [applyUploadedMediaMutation],
    );

    const createVideoFileNode = useCallback(
        async (file: File, position: Position) => {
            const video = await uploadMediaFile(file, "video");
            const nextSize = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
            applyUploadedMediaMutation({
                mode: "create",
                type: CanvasNodeType.Video,
                title: file.name,
                position,
                width: nextSize.width,
                height: nextSize.height,
                metadata: videoMetadata(video),
            });
        },
        [applyUploadedMediaMutation],
    );

    const createAudioFileNode = useCallback(
        async (file: File, position: Position) => {
            const audio = await uploadMediaFile(file, "audio");
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
            applyUploadedMediaMutation({
                mode: "create",
                type: CanvasNodeType.Audio,
                title: file.name,
                position,
                width: spec.width,
                height: spec.height,
                metadata: audioMetadata(audio),
            });
        },
        [applyUploadedMediaMutation],
    );

    const createMediaFileNode = useCallback(
        (file: File, position: Position) => {
            if (isAudioFile(file)) return createAudioFileNode(file, position);
            if (isVideoFile(file)) return createVideoFileNode(file, position);
            return createImageFileNode(file, position);
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode],
    );

    const replaceMediaFileNode = useCallback(
        async (file: File, nodeId: string) => {
            if (isAudioFile(file)) {
                const audio = await uploadMediaFile(file, "audio");
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                applyUploadedMediaMutation({
                    mode: "replace",
                    nodeId,
                    type: CanvasNodeType.Audio,
                    title: file.name,
                    width: spec.width,
                    height: spec.height,
                    metadata: audioMetadata(audio),
                });
                return;
            }

            if (isVideoFile(file)) {
                const video = await uploadMediaFile(file, "video");
                const nextSize = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                applyUploadedMediaMutation({
                    mode: "replace",
                    nodeId,
                    type: CanvasNodeType.Video,
                    title: file.name,
                    width: nextSize.width,
                    height: nextSize.height,
                    metadata: videoMetadata(video),
                });
                return;
            }

            const image = await uploadImage(file);
            const imageSize = fitNodeSize(image.width, image.height);
            applyUploadedMediaMutation({
                mode: "replace",
                nodeId,
                type: CanvasNodeType.Image,
                title: file.name,
                width: imageSize.width,
                height: imageSize.height,
                metadata: imageMetadata(image),
            });
        },
        [applyUploadedMediaMutation],
    );

    const handleUploadRequest = useCallback(
        (nodeId?: string, position?: Position, workflow?: CanvasImageWorkflowAction) => {
            uploadTargetRef.current = { nodeId, position, workflow };
            imageInputRef.current?.click();
        },
        [imageInputRef],
    );

    const handleImageInputChange = useCallback(
        async (event: ReactChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            const target = uploadTargetRef.current;
            if (!file || !isCanvasUploadFile(file)) return;

            if (target?.workflow) {
                if (!isImageFile(file)) {
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                await createWorkflowFromFile(
                    file,
                    { ...target, workflow: target.workflow },
                    {
                        nodesRef,
                        connectionsRef,
                        setNodes,
                        setConnections,
                        setSelectedNodeIds,
                        setSelectedConnectionId,
                        setDialogNodeId,
                        effectiveConfig,
                    },
                );
                uploadTargetRef.current = null;
                event.target.value = "";
                return;
            }

            if (target?.nodeId) {
                await replaceMediaFileNode(file, target.nodeId);
            } else {
                const position = target?.position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                void createMediaFileNode(file, position);
            }

            uploadTargetRef.current = null;
            event.target.value = "";
        },
        [connectionsRef, containerRef, createMediaFileNode, effectiveConfig, nodesRef, replaceMediaFileNode, screenToCanvas, setConnections, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, size.height, size.width],
    );

    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const file = Array.from(event.dataTransfer.files).find(isCanvasUploadFile);
            if (!file) return;

            const pos = screenToCanvas(event.clientX, event.clientY);
            void createMediaFileNode(file, pos);
        },
        [createMediaFileNode, screenToCanvas],
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

function isImageFile(file: File) {
    return file.type.startsWith("image/");
}

function isVideoFile(file: File) {
    return file.type.startsWith("video/");
}

function isCanvasUploadFile(file: File) {
    return isImageFile(file) || isVideoFile(file) || isAudioFile(file);
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
                  count: normalizeImageGenerationCount(config.canvasImageCount || config.count, config.imageModel || config.model),
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
