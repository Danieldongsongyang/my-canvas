import { describe, expect, it } from "vitest";

import { defaultConfig } from "@/stores/use-config-store";

import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "../types";
import { applyCanvasPanoramaGenerationConfig, applyCanvasPanoramaMetadata, buildCanvasPanoramaPrompt, canvasPanoramaReadinessHint, isCanvasPanoramaEnabled } from "./canvas-panorama-policy";

function node(metadata?: CanvasNodeMetadata): CanvasNodeData {
    return {
        id: "node-1",
        type: CanvasNodeType.Text,
        title: "提示词",
        position: { x: 0, y: 0 },
        width: 320,
        height: 180,
        metadata,
    };
}

describe("canvas panorama policy", () => {
    it("treats only explicit true metadata as enabled", () => {
        expect(isCanvasPanoramaEnabled()).toBe(false);
        expect(isCanvasPanoramaEnabled(node())).toBe(false);
        expect(isCanvasPanoramaEnabled(node({ panorama: false }))).toBe(false);
        expect(isCanvasPanoramaEnabled(node({ panorama: true }))).toBe(true);
    });

    it("enhances prompts once with the core panorama constraints", () => {
        const prompt = buildCanvasPanoramaPrompt("雨夜街角便利店", true);

        expect(prompt).toContain("雨夜街角便利店");
        expect(prompt).toContain("等距矩形 360 全景图");
        expect(prompt).toContain("2:1");
        expect(prompt).toContain("水平无缝环绕");
        expect(prompt).toContain("完整环境");
        expect(prompt).toContain("无文字");
        expect(prompt).toContain("无水印");
        expect(prompt).toContain("无边框");
        expect(buildCanvasPanoramaPrompt(prompt, true)).toBe(prompt);
        expect(buildCanvasPanoramaPrompt("普通图片", false)).toBe("普通图片");
    });

    it("forces panorama image generation to 2:1 without mutating the input config", () => {
        const config = { ...defaultConfig, model: "image-model", size: "1:1", count: "2" };
        const result = applyCanvasPanoramaGenerationConfig(config, true);

        expect(result).toEqual(expect.objectContaining({ model: "image-model", size: "2:1", count: "2" }));
        expect(config.size).toBe("1:1");
        expect(applyCanvasPanoramaGenerationConfig(config, false)).toBe(config);
    });

    it("writes explicit true and false panorama metadata", () => {
        expect(applyCanvasPanoramaMetadata({ prompt: "a" }, true)).toEqual({ prompt: "a", panorama: true });
        expect(applyCanvasPanoramaMetadata({ prompt: "a" }, false)).toEqual({ prompt: "a", panorama: false });
    });

    it("returns only non-blocking readiness hints for unsuitable panorama dimensions", () => {
        expect(canvasPanoramaReadinessHint({ width: 2048, height: 1024 })).toBeNull();
        expect(canvasPanoramaReadinessHint({ width: 1024, height: 768 })).toBe("当前图片不是 2:1 比例，全景查看可能出现拉伸或接缝。");
        expect(canvasPanoramaReadinessHint({})).toBe("当前图片缺少尺寸信息，全景查看可能出现拉伸或接缝。");
    });
});
