import { describe, expect, it, vi } from "vitest";

vi.mock("@photo-sphere-viewer/core", () => ({
    Viewer: class Viewer {},
}));

import {
    createPanoramaViewerConfig,
    getMissingPanoramaSrcMessage,
    ISOLATED_EVENTS,
    stopCanvasEvent,
    VIEWER_ERROR_MESSAGE,
} from "./canvas-panorama-viewer";

describe("canvas-panorama-viewer helpers", () => {
    it("returns a stable viewer config for panorama rendering", () => {
        const container = {} as HTMLDivElement;

        expect(createPanoramaViewerConfig(container, "panorama-url", "测试全景")).toEqual({
            container,
            panorama: "panorama-url",
            caption: "测试全景",
            loadingTxt: "正在加载全景图...",
            navbar: ["zoom", "move", "fullscreen"],
        });
    });

    it("reports a localized error when the panorama source is missing", () => {
        expect(getMissingPanoramaSrcMessage("")).toBe("缺少全景图片地址，无法打开查看器。");
        expect(getMissingPanoramaSrcMessage("panorama-url")).toBeNull();
        expect(VIEWER_ERROR_MESSAGE).toContain("全景查看器加载失败");
    });

    it("keeps the canvas-isolated event list stable and stops propagation", () => {
        expect(ISOLATED_EVENTS).toEqual(["wheel", "pointerdown", "pointermove", "pointerup", "mousedown", "mousemove", "mouseup", "dblclick"]);

        const stopPropagation = vi.fn();
        stopCanvasEvent({ stopPropagation } as unknown as Event);
        expect(stopPropagation).toHaveBeenCalledTimes(1);
    });
});
