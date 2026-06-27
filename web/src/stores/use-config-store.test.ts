import { describe, expect, it } from "vitest";

import { defaultConfig, defaultWebdavSyncConfig, normalizePersistedWebdavConfig, resolveConfigWithModels, selectableModelsByCapability } from "@/stores/use-config-store";

describe("config model resolution", () => {
    it("builds remote model selections from the current user's available models", () => {
        const config = resolveConfigWithModels(
            {
                ...defaultConfig,
                model: "missing-text-model",
                imageModel: "missing-image-model",
                videoModel: "missing-video-model",
                audioModel: "missing-audio-model",
            },
            ["seedream-4", "gpt-5.5", "gpt-5.5", "grok-imagine-video", "tts-1", " "],
        );

        expect(config.models).toEqual(["gpt-5.5", "grok-imagine-video", "seedream-4", "tts-1"]);
        expect(selectableModelsByCapability(config, "text")).toEqual(["gpt-5.5"]);
        expect(selectableModelsByCapability(config, "image")).toEqual(["seedream-4"]);
        expect(selectableModelsByCapability(config, "video")).toEqual(["grok-imagine-video"]);
        expect(selectableModelsByCapability(config, "audio")).toEqual(["tts-1"]);
        expect(config).toMatchObject({
            model: "gpt-5.5",
            textModel: "gpt-5.5",
            imageModel: "seedream-4",
            videoModel: "grok-imagine-video",
            audioModel: "tts-1",
        });
    });

    it("keeps existing defaults when they are still available", () => {
        const config = resolveConfigWithModels(
            {
                ...defaultConfig,
                model: "claude-sonnet-5",
                textModel: "claude-sonnet-5",
                imageModel: "gpt-image-2",
            },
            ["gpt-5.5", "claude-sonnet-5", "gpt-image-2"],
        );

        expect(config.model).toBe("claude-sonnet-5");
        expect(config.textModel).toBe("claude-sonnet-5");
        expect(config.imageModel).toBe("gpt-image-2");
    });
});

describe("webdav config normalization", () => {
    it("downgrades persisted nextjs proxy mode to direct", () => {
        expect(
            normalizePersistedWebdavConfig({
                proxyMode: "nextjs",
                url: "https://dav.example.com",
                directory: "canvas",
            }),
        ).toEqual({
            ...defaultWebdavSyncConfig,
            proxyMode: "direct",
            url: "https://dav.example.com",
            directory: "canvas",
        });
    });
});
