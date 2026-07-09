import type { AiConfig } from "@/stores/use-config-store";

import type { CanvasNodeData, CanvasNodeMetadata } from "../types";

const PANORAMA_SIZE = "2:1";
const PANORAMA_PROMPT_CONSTRAINTS = "等距矩形 360 全景图，2:1 比例，水平无缝环绕，完整环境，无文字，无水印，无边框";
const PANORAMA_KEYWORDS = ["全景", "panorama", "等距矩形", "equirectangular"];
const PANORAMA_RATIO_TOLERANCE = 0.02;

export function isCanvasPanoramaEnabled(node?: Pick<CanvasNodeData, "metadata"> | null) {
    return node?.metadata?.panorama === true;
}

export function buildCanvasPanoramaPrompt(prompt: string, enabled: boolean) {
    if (!enabled) return prompt;
    const trimmed = prompt.trim();
    if (hasPanoramaKeyword(trimmed)) return trimmed;
    return trimmed ? `${trimmed}。${PANORAMA_PROMPT_CONSTRAINTS}` : PANORAMA_PROMPT_CONSTRAINTS;
}

export function applyCanvasPanoramaGenerationConfig(config: AiConfig, enabled: boolean): AiConfig {
    if (!enabled) return config;
    return { ...config, size: PANORAMA_SIZE };
}

export function applyCanvasPanoramaMetadata(metadata: CanvasNodeMetadata | undefined, enabled: boolean): CanvasNodeMetadata {
    return { ...(metadata || {}), panorama: enabled };
}

export function canvasPanoramaReadinessHint(size: { width?: number; height?: number }) {
    if (!size.width || !size.height) return "当前图片缺少尺寸信息，全景查看可能出现拉伸或接缝。";
    return Math.abs(size.width / size.height - 2) <= PANORAMA_RATIO_TOLERANCE ? null : "当前图片不是 2:1 比例，全景查看可能出现拉伸或接缝。";
}

function hasPanoramaKeyword(prompt: string) {
    const normalized = prompt.toLowerCase();
    return PANORAMA_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()));
}
