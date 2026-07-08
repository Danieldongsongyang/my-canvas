import { beforeEach, describe, expect, it, vi } from "vitest";

import { createInMemoryStudioStorage, createStudioRepository, type StudioEpisodePatch } from "@/services/studio-local";
import type { AiConfig } from "@/stores/use-config-store";

const { uploadAssetImage, uploadImage } = vi.hoisted(() => ({
    uploadAssetImage: vi.fn(async () => ({
        url: "blob:asset-media-studio",
        storageKey: "image:asset-media-studio",
        width: 1024,
        height: 1536,
        bytes: 1234,
        mimeType: "image/png",
    })),
    uploadImage: vi.fn(async () => {
        throw new Error("Studio generation must not call direct image storage");
    }),
}));

vi.mock("@/services/asset-media-storage", () => ({ uploadAssetImage }));
vi.mock("@/services/image-storage", () => ({ uploadImage }));

const config: AiConfig = {
    channelMode: "remote",
    baseUrl: "https://api.openai.com",
    apiKey: "",
    model: "gpt-5.5",
    imageModel: "gpt-image-1",
    videoModel: "sora-1",
    textModel: "gpt-5.5",
    audioModel: "",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    models: ["gpt-5.5"],
    imageModels: ["gpt-image-1"],
    videoModels: ["sora-1"],
    textModels: ["gpt-5.5"],
    audioModels: [],
    quality: "auto",
    size: "1:1",
    count: "1",
    canvasImageCount: "3",
};

const generatedDataUrl = "data:image/png;base64,AAA";

const artDirection = {
    status: "completed",
    name: "雨夜霓虹电影感",
    positivePrompt: "cinematic neon noir",
    negativePrompt: "",
    savedAt: "2026-07-01T08:30:00.000Z",
};

async function createStudioFixture(patch: StudioEpisodePatch) {
    const repository = createStudioRepository(createInMemoryStudioStorage());
    const series = await repository.createSeries({ title: "山海便利店" });
    const episode = series.episodes[0];

    await repository.updateEpisode(series.id, episode.id, {
        generation: { artDirection },
        ...patch,
    });

    return { repository, series, episode };
}

describe("studio generation default media storage", () => {
    beforeEach(() => {
        uploadAssetImage.mockClear();
        uploadImage.mockClear();
    });

    it("stores default Cast generated images through Asset Media Storage", async () => {
        const { generateCastReferences } = await import("@/services/api/studio-generation");
        const { repository, series, episode } = await createStudioFixture({
            characters: [{ id: "char-1", name: "阿岚", description: "夜班店员", prompt: "阿岚角色参考图", assetRefs: [] }],
        });

        const result = await generateCastReferences({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            config,
            target: { mode: "allMissing" },
            count: 1,
            requestImages: vi.fn(async () => [{ id: "image-1", dataUrl: generatedDataUrl }]),
            addAsset: vi.fn(() => "asset-1"),
        });

        expect(uploadAssetImage).toHaveBeenCalledTimes(1);
        expect(uploadAssetImage).toHaveBeenCalledWith(generatedDataUrl);
        expect(uploadImage).not.toHaveBeenCalled();
        expect(result.episode.characters[0].assetRefs).toMatchObject([{ assetId: "asset-1", kind: "image", role: "selected" }]);
    });

    it("stores default storyboard generated images through Asset Media Storage", async () => {
        const { generateStoryboardShotImages } = await import("@/services/api/studio-generation");
        const { repository, series, episode } = await createStudioFixture({
            shots: [{ id: "shot-1", title: "开场", order: 1, description: "雨夜便利店外景", prompt: "wide rainy neon convenience store", assetRefs: [] }],
        });

        const result = await generateStoryboardShotImages({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            shotId: "shot-1",
            config,
            assets: [],
            count: 1,
            allowNoReferences: true,
            requestGeneration: vi.fn(async () => [{ id: "image-1", dataUrl: generatedDataUrl }]),
            addAsset: vi.fn(() => "asset-shot-1"),
        });

        expect(uploadAssetImage).toHaveBeenCalledTimes(1);
        expect(uploadAssetImage).toHaveBeenCalledWith(generatedDataUrl);
        expect(uploadImage).not.toHaveBeenCalled();
        expect(result.episode.shots[0].assetRefs).toMatchObject([{ assetId: "asset-shot-1", kind: "image", role: "selected" }]);
    });
});
