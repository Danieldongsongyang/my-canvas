import { CanvasNodeType } from "./types";
import type { CanvasNodeMetadata } from "./types";

type CanvasNodeSpec = {
    width: number;
    height: number;
    title: string;
    metadata?: CanvasNodeMetadata;
};

export const NODE_DEFAULT_SIZE = {
    [CanvasNodeType.Image]: { width: 340, height: 240, title: "New Generation" },
    [CanvasNodeType.Text]: { width: 340, height: 240, title: "Note" },
    [CanvasNodeType.Config]: { width: 340, height: 240, title: "生成配置" },
    [CanvasNodeType.Video]: { width: 420, height: 236, title: "Video" },
    [CanvasNodeType.Audio]: { width: 340, height: 120, title: "Audio" },
    [CanvasNodeType.ImageEditor]: { width: 340, height: 240, title: "Image Editor" },
    [CanvasNodeType.VideoEditor]: { width: 420, height: 236, title: "Video Editor" },
    [CanvasNodeType.Storyboard]: { width: 500, height: 360, title: "Storyboard" },
    [CanvasNodeType.CameraAngle]: { width: 340, height: 240, title: "Camera Angle" },
    [CanvasNodeType.LocalImageModel]: { width: 340, height: 240, title: "Local Image Model" },
    [CanvasNodeType.LocalVideoModel]: { width: 420, height: 236, title: "Local Video Model" },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;

export const NODE_SPECS = {
    [CanvasNodeType.Image]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Image],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Text]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Text],
        metadata: { content: "", status: "idle", fontSize: 14, textMode: "menu" },
    },
    [CanvasNodeType.Config]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Config],
        metadata: { content: "", status: "idle", generationMode: "image" },
    },
    [CanvasNodeType.Video]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Video],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Audio]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Audio],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.ImageEditor]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.ImageEditor],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.VideoEditor]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.VideoEditor],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Storyboard]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Storyboard],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.CameraAngle]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.CameraAngle],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.LocalImageModel]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.LocalImageModel],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.LocalVideoModel]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.LocalVideoModel],
        metadata: { content: "", status: "idle" },
    },
} satisfies Record<CanvasNodeType, CanvasNodeSpec>;

export function getNodeSpec(type: CanvasNodeType) {
    return NODE_SPECS[type];
}
