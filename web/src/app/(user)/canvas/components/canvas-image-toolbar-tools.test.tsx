import { describe, expect, it, vi } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { IMAGE_QUICK_TOOLS_STORAGE_KEY, buildImageToolbarTools, defaultImageQuickToolIds, readImageQuickToolsConfig } from "./canvas-image-toolbar-tools";

function imageNode(metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return {
        id: "image-1",
        type: CanvasNodeType.Image,
        title: "图片",
        position: { x: 0, y: 0 },
        width: 320,
        height: 180,
        metadata: { content: "data:image/png;base64,a", ...metadata },
    };
}

function handlers(overrides: Partial<Parameters<typeof buildImageToolbarTools>[1]> = {}): Parameters<typeof buildImageToolbarTools>[1] {
    return {
        onUpload: vi.fn(),
        onToggleFreeResize: vi.fn(),
        onTogglePanorama: vi.fn(),
        onMaskEdit: vi.fn(),
        onCrop: vi.fn(),
        onSplit: vi.fn(),
        onUpscale: vi.fn(),
        onSuperResolve: vi.fn(),
        onAngle: vi.fn(),
        onViewImage: vi.fn(),
        onCopyPrompt: vi.fn(),
        onReversePrompt: vi.fn(),
        onImageToImage: vi.fn(),
        onImageToVideo: vi.fn(),
        ...overrides,
    };
}

describe("canvas image toolbar tools", () => {
    it("upgrades the quick tools storage key and includes panorama by default", () => {
        expect(IMAGE_QUICK_TOOLS_STORAGE_KEY).toBe("canvas-image-quick-tools-v8");
        expect(defaultImageQuickToolIds).toContain("panorama");
        expect(readImageQuickToolsConfig({ ids: defaultImageQuickToolIds, showLabels: true }).ids).toContain("panorama");
    });

    it("describes inactive and active panorama states", () => {
        const inactive = buildImageToolbarTools(imageNode({ panorama: false }), handlers()).find((tool) => tool.id === "panorama");
        const active = buildImageToolbarTools(imageNode({ panorama: true }), handlers()).find((tool) => tool.id === "panorama");

        expect(inactive).toMatchObject({ label: "平面", title: "切换为全景图", active: false });
        expect(active).toMatchObject({ label: "全景", title: "切换为平面图片", active: true });
    });

    it("runs the panorama toggle handler from the panorama tool", () => {
        const onTogglePanorama = vi.fn();
        const node = imageNode({ panorama: true });
        const tool = buildImageToolbarTools(node, handlers({ onTogglePanorama })).find((item) => item.id === "panorama");

        tool?.onClick();

        expect(onTogglePanorama).toHaveBeenCalledWith(node);
    });
});
