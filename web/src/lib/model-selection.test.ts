import { describe, expect, it } from "vitest";

import { selectEffectiveModel } from "@/lib/model-selection";
import { defaultConfig, resolveConfigWithModels, type AiConfig } from "@/stores/use-config-store";

function remoteConfig(models: string[], overrides: Partial<AiConfig> = {}) {
    return resolveConfigWithModels({ ...defaultConfig, ...overrides }, models);
}

describe("selectEffectiveModel", () => {
    it("uses Studio project preferences while they are still available remotely", () => {
        const config = remoteConfig(["gpt-5.5", "claude-sonnet-5", "seedream-4", "gpt-image-2", "sora-1", "kling-v3"]);

        expect(selectEffectiveModel({ config, capability: "text", studioPreferences: { textModel: "claude-sonnet-5" } })).toMatchObject({
            model: "claude-sonnet-5",
            source: "project",
            ready: true,
            reason: "",
        });
        expect(selectEffectiveModel({ config, capability: "image", studioPreferences: { imageModel: "gpt-image-2" } })).toMatchObject({
            model: "gpt-image-2",
            source: "project",
            ready: true,
        });
        expect(selectEffectiveModel({ config, capability: "video", studioPreferences: { videoModel: "kling-v3" } })).toMatchObject({
            model: "kling-v3",
            source: "project",
            ready: true,
        });
    });

    it("falls back when a Studio project preference disappears from the remote model list", () => {
        const config = remoteConfig(["gpt-5.5", "seedream-4"], {
            textModel: "gpt-5.5",
            imageModel: "seedream-4",
        });

        expect(selectEffectiveModel({ config, capability: "image", studioPreferences: { imageModel: "removed-image-model" } })).toEqual({
            capability: "image",
            model: "seedream-4",
            source: "global",
            ready: true,
            reason: "项目偏好模型 removed-image-model 当前不可用，已使用全局模型。",
        });
    });

    it("returns a missing state when neither project nor global remote models are available", () => {
        const config = remoteConfig(["gpt-5.5"], {
            imageModel: "removed-image-model",
        });

        expect(selectEffectiveModel({ config, capability: "image", studioPreferences: { imageModel: "also-removed" } })).toEqual({
            capability: "image",
            model: "",
            source: "missing",
            ready: false,
            reason: "项目偏好模型 also-removed 当前不可用，且没有可用的图像模型。",
        });
    });

    it("reports local direct mode Base URL and API Key readiness consistently", () => {
        const config = {
            ...defaultConfig,
            channelMode: "local" as const,
            baseUrl: "",
            apiKey: "",
            model: "local-text",
            textModel: "local-text",
            imageModel: "local-image",
            videoModel: "local-video",
        };

        expect(selectEffectiveModel({ config, capability: "text" })).toMatchObject({ model: "local-text", ready: false, reason: "请先配置 Base URL 和 API Key。" });
        expect(selectEffectiveModel({ config, capability: "image" })).toMatchObject({ model: "local-image", ready: false, reason: "请先配置 Base URL 和 API Key。" });
        expect(selectEffectiveModel({ config, capability: "video" })).toMatchObject({ model: "local-video", ready: false, reason: "请先配置 Base URL 和 API Key。" });
    });
});
