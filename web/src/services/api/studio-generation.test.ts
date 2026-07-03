import { describe, expect, it, vi } from "vitest";

import { createInMemoryStudioStorage, createStudioRepository } from "@/services/studio-local";
import {
    addCastAssetReference,
    generateCastReferences,
    normalizeScriptStructure,
    parseAndApplyScript,
    parseScript,
    removeCastCandidateReference,
    selectCastAssetReference,
    StudioGenerationError,
    updateCastEntityPrompt,
} from "@/services/api/studio-generation";
import type { AiConfig } from "@/stores/use-config-store";

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

const relayJson = JSON.stringify({
    characters: [{ name: "阿岚", description: "夜班店员，外冷内热", prompt: "阿岚，夜班便利店店员，冷静神情，深色制服，角色参考设定图" }],
    scenes: [{ name: "山海便利店", description: "雨夜里的街角便利店", prompt: "雨夜街角便利店，霓虹灯反射在湿润路面，室内暖光" }],
    props: [{ name: "发光贝壳", description: "能映出海潮记忆", prompt: "发光贝壳道具，半透明蓝色纹理，柔和海潮微光，产品参考图" }],
    shotDrafts: [
        {
            title: "雨夜开场",
            description: "霓虹灯下，阿岚擦拭柜台，门口风铃响起。",
            dialogue: "又是这个点。",
        },
        {
            title: "贝壳亮起",
            description: "客人放下发光贝壳，货架间映出蓝色海浪。",
        },
    ],
});

describe("studio generation adapter", () => {
    it("parses mocked relay JSON into validated Studio episode fields", async () => {
        const requestChat = vi.fn(async () => `模型输出如下：\n\`\`\`json\n${relayJson}\n\`\`\``);

        const result = await parseScript({
            script: "雨夜，山海便利店。",
            config,
            requestChat,
        });

        expect(requestChat).toHaveBeenCalledWith(
            expect.objectContaining({ ...config, model: "gpt-5.5", textModel: "gpt-5.5" }),
            expect.arrayContaining([expect.objectContaining({ role: "system" }), expect.objectContaining({ role: "user", content: expect.stringContaining("雨夜，山海便利店。") })]),
        );
        expect(result.characters).toMatchObject([{ name: "阿岚", description: "夜班店员，外冷内热", prompt: "阿岚，夜班便利店店员，冷静神情，深色制服，角色参考设定图", assetRefs: [] }]);
        expect(result.scenes).toMatchObject([{ name: "山海便利店", description: "雨夜里的街角便利店", prompt: "雨夜街角便利店，霓虹灯反射在湿润路面，室内暖光", assetRefs: [] }]);
        expect(result.props).toMatchObject([{ name: "发光贝壳", description: "能映出海潮记忆", prompt: "发光贝壳道具，半透明蓝色纹理，柔和海潮微光，产品参考图", assetRefs: [] }]);
        expect(result.shots).toMatchObject([
            { title: "雨夜开场", order: 1, description: "霓虹灯下，阿岚擦拭柜台，门口风铃响起。", dialogue: "又是这个点。", assetRefs: [] },
            { title: "贝壳亮起", order: 2, description: "客人放下发光贝壳，货架间映出蓝色海浪。", assetRefs: [] },
        ]);
        expect(result.rawText).toContain("模型输出如下");
    });

    it("writes parsed script results to the Studio episode through the repository boundary", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        const requestChat = vi.fn(async () => relayJson);

        const updated = await parseAndApplyScript({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            script: "雨夜，山海便利店。",
            config,
            requestChat,
        });

        expect(updated.episode.script).toBe("雨夜，山海便利店。");
        expect(updated.episode.characters).toHaveLength(1);
        expect(updated.episode.shots).toHaveLength(2);
        expect(updated.episode.generation).toMatchObject({
            scriptParser: {
                model: "gpt-5.5",
                status: "completed",
            },
        });
        await expect(repository.getSeries(series.id)).resolves.toMatchObject({
            episodes: [expect.objectContaining({ characters: [expect.objectContaining({ name: "阿岚" })] })],
        });
    });

    it("preserves existing generation metadata when script parsing completes", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            generation: {
                manualStructure: {
                    status: "completed",
                    savedAt: "2026-07-01T07:40:00.000Z",
                },
            },
        });

        const updated = await parseAndApplyScript({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            script: "雨夜，山海便利店。",
            config,
            requestChat: vi.fn(async () => relayJson),
        });

        expect(updated.episode.generation).toMatchObject({
            manualStructure: {
                status: "completed",
                savedAt: "2026-07-01T07:40:00.000Z",
            },
            scriptParser: {
                model: "gpt-5.5",
                status: "completed",
            },
        });
    });

    it("keeps existing manual episode data when relay output is malformed", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            script: "手工剧本",
            shots: [{ id: "manual-shot", title: "手工分镜", order: 1, description: "保留用户已编辑内容", assetRefs: [] }],
        });

        await expect(
            parseAndApplyScript({
                repository,
                seriesId: series.id,
                episodeId: episode.id,
                script: "新剧本",
                config,
                requestChat: vi.fn(async () => "这不是 JSON"),
            }),
        ).rejects.toBeInstanceOf(StudioGenerationError);

        await expect(repository.getSeries(series.id)).resolves.toMatchObject({
            episodes: [expect.objectContaining({ script: "手工剧本", shots: [expect.objectContaining({ title: "手工分镜" })] })],
        });
    });

    it("normalizes manually edited structured drafts with the same Studio schema", () => {
        const result = normalizeScriptStructure({
            characters: [{ name: " 手工角色 ", description: "手动补充", prompt: "手工角色参考图" }],
            scenes: [],
            props: [],
            shotDrafts: [{ title: " 手工镜头 ", description: "用户自己写的分镜" }],
        });

        expect(result.characters).toMatchObject([{ name: "手工角色", description: "手动补充", prompt: "手工角色参考图", assetRefs: [] }]);
        expect(result.shots).toMatchObject([{ title: "手工镜头", order: 1, description: "用户自己写的分镜", assetRefs: [] }]);
    });

    it("generates a selected Cast reference for a missing character through asset-first storage", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            characters: [{ id: "char-1", name: "阿岚", description: "夜班店员", prompt: "阿岚角色参考图", assetRefs: [] }],
            generation: {
                artDirection: {
                    status: "completed",
                    presetId: "cinematic-neon-noir",
                    name: "雨夜霓虹电影感",
                    positivePrompt: "cinematic neon noir, teal rim light",
                    negativePrompt: "low quality, blurry",
                    savedAt: "2026-07-01T08:30:00.000Z",
                },
            },
        });
        const requestImages = vi.fn(async () => [{ id: "image-1", dataUrl: "data:image/png;base64,AAA" }]);
        const storeImage = vi.fn(async () => ({
            url: "blob:studio-cast-1",
            storageKey: "image:studio-cast-1",
            width: 1024,
            height: 1536,
            bytes: 1234,
            mimeType: "image/png",
        }));
        const addAsset = vi.fn(() => "asset-1");

        const result = await generateCastReferences({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            config,
            target: { mode: "allMissing" },
            count: 1,
            requestImages,
            storeImage,
            addAsset,
            now: () => "2026-07-03T10:00:00.000Z",
        });

        expect(requestImages).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-image-1", imageModel: "gpt-image-1", count: "1", size: "9:16" }), expect.stringContaining("Style baseline:\ncinematic neon noir, teal rim light"));
        expect(storeImage).toHaveBeenCalledWith("data:image/png;base64,AAA");
        expect(addAsset).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: "image",
                title: "阿岚 参考图 1",
                coverUrl: "blob:studio-cast-1",
                source: "Studio Cast",
                data: expect.objectContaining({ storageKey: "image:studio-cast-1", width: 1024, height: 1536 }),
                metadata: expect.objectContaining({
                    source: "studio-cast",
                    seriesId: series.id,
                    episodeId: episode.id,
                    entityKind: "character",
                    entityId: "char-1",
                    effectivePrompt: expect.stringContaining("Style baseline:"),
                    negativePrompt: "low quality, blurry, text, labels, watermark, UI overlay, panel borders, multiple separate images, inconsistent face, inconsistent outfit, distorted anatomy",
                    model: "gpt-image-1",
                    aspectRatio: "9:16",
                }),
            }),
        );
        expect(result.results).toEqual([{ kind: "character", id: "char-1", name: "阿岚", status: "completed", createdAssetIds: ["asset-1"], selectedAssetId: "asset-1" }]);
        expect(result.episode.characters[0]).toMatchObject({
            assetRefs: [
                {
                    assetId: "asset-1",
                    kind: "image",
                    role: "selected",
                    metadata: expect.objectContaining({
                        effectivePrompt: expect.stringContaining("阿岚角色参考图"),
                        negativePrompt: expect.stringContaining("low quality"),
                        model: "gpt-image-1",
                        aspectRatio: "9:16",
                        generatedAt: "2026-07-03T10:00:00.000Z",
                    }),
                },
            ],
            generation: {
                image: expect.objectContaining({
                    status: "completed",
                    lastEffectivePrompt: expect.stringContaining("Style baseline:"),
                    lastModel: "gpt-image-1",
                    lastAspectRatio: "9:16",
                    lastGeneratedAt: "2026-07-03T10:00:00.000Z",
                }),
            },
        });
    });

    it("skips existing selected refs and preserves successful targets when another Cast target fails", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            characters: [
                {
                    id: "char-ready",
                    name: "阿岚",
                    description: "已有主参考图",
                    prompt: "阿岚角色参考图",
                    assetRefs: [{ assetId: "asset-existing", kind: "image", role: "selected" }],
                },
            ],
            scenes: [{ id: "scene-1", name: "便利店", description: "雨夜街角", prompt: "雨夜街角便利店", assetRefs: [] }],
            props: [{ id: "prop-1", name: "贝壳", description: "会发光", prompt: "发光贝壳道具", assetRefs: [] }],
            generation: {
                artDirection: {
                    status: "completed",
                    name: "雨夜霓虹电影感",
                    positivePrompt: "cinematic neon noir",
                    negativePrompt: "",
                    savedAt: "2026-07-01T08:30:00.000Z",
                },
            },
        });
        const requestImages = vi.fn(async (_nextConfig: AiConfig, prompt: string) => {
            if (prompt.includes("贝壳")) throw new Error("道具生成失败");
            return [{ id: "scene-image", dataUrl: "data:image/png;base64,SCENE" }];
        });
        const storeImage = vi.fn(async () => ({
            url: "blob:scene",
            storageKey: "image:scene",
            width: 1600,
            height: 900,
            bytes: 2222,
            mimeType: "image/png",
        }));
        const addAsset = vi.fn(() => "asset-scene");

        const result = await generateCastReferences({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            config,
            target: { mode: "allMissing" },
            count: 1,
            requestImages,
            storeImage,
            addAsset,
            now: () => "2026-07-03T10:05:00.000Z",
        });

        expect(requestImages).toHaveBeenCalledTimes(2);
        expect(requestImages.mock.calls.map(([, prompt]) => prompt)).not.toEqual(expect.arrayContaining([expect.stringContaining("阿岚")]));
        expect(result.results).toMatchObject([
            { kind: "scene", id: "scene-1", status: "completed", createdAssetIds: ["asset-scene"], selectedAssetId: "asset-scene" },
            { kind: "prop", id: "prop-1", status: "failed", error: "道具生成失败" },
        ]);
        expect(result.episode.characters[0].assetRefs).toEqual([{ assetId: "asset-existing", kind: "image", role: "selected" }]);
        expect(result.episode.scenes[0]).toMatchObject({ assetRefs: [{ assetId: "asset-scene", kind: "image", role: "selected" }] });
        expect(result.episode.props[0]).toMatchObject({
            assetRefs: [],
            generation: { image: expect.objectContaining({ status: "failed", lastImageError: "道具生成失败" }) },
        });
    });

    it("appends Workbench ids-mode generations as candidates when a selected ref already exists", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            characters: [
                {
                    id: "char-1",
                    name: "阿岚",
                    description: "夜班店员",
                    prompt: "阿岚角色参考图",
                    assetRefs: [{ assetId: "asset-selected", kind: "image", role: "selected" }],
                },
            ],
            generation: {
                artDirection: {
                    status: "completed",
                    name: "雨夜霓虹电影感",
                    positivePrompt: "cinematic neon noir",
                    negativePrompt: "",
                    savedAt: "2026-07-01T08:30:00.000Z",
                },
            },
        });
        const requestImages = vi.fn(async () => [
            { id: "image-1", dataUrl: "data:image/png;base64,AAA" },
            { id: "image-2", dataUrl: "data:image/png;base64,BBB" },
        ]);
        const storeImage = vi
            .fn()
            .mockResolvedValueOnce({ url: "blob:one", storageKey: "image:one", width: 1024, height: 1536, bytes: 111, mimeType: "image/png" })
            .mockResolvedValueOnce({ url: "blob:two", storageKey: "image:two", width: 1024, height: 1536, bytes: 222, mimeType: "image/png" });
        const addAsset = vi.fn().mockReturnValueOnce("asset-new-1").mockReturnValueOnce("asset-new-2");

        const result = await generateCastReferences({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            config,
            target: { mode: "ids", kind: "character", ids: ["char-1"] },
            count: 2,
            requestImages,
            storeImage,
            addAsset,
            now: () => "2026-07-03T10:10:00.000Z",
        });

        expect(requestImages).toHaveBeenCalledWith(expect.objectContaining({ count: "2" }), expect.any(String));
        expect(result.episode.characters[0].assetRefs).toMatchObject([
            { assetId: "asset-selected", kind: "image", role: "selected" },
            { assetId: "asset-new-1", kind: "image", role: "candidate" },
            { assetId: "asset-new-2", kind: "image", role: "candidate" },
        ]);
    });

    it("promotes a candidate Cast ref to selected and demotes the previous selected ref", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            characters: [
                {
                    id: "char-1",
                    name: "阿岚",
                    description: "夜班店员",
                    prompt: "阿岚角色参考图",
                    assetRefs: [
                        { assetId: "asset-old", kind: "image", role: "selected" },
                        { assetId: "asset-next", kind: "image", role: "candidate" },
                    ],
                },
            ],
        });

        const result = await selectCastAssetReference({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            kind: "character",
            entityId: "char-1",
            assetId: "asset-next",
        });

        expect(result.episode.characters[0].assetRefs).toEqual([
            { assetId: "asset-old", kind: "image", role: "candidate" },
            { assetId: "asset-next", kind: "image", role: "selected" },
        ]);
    });

    it("adds an external image asset ref before selecting it and keeps selected refs unique", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            props: [
                {
                    id: "prop-1",
                    name: "贝壳",
                    description: "会发光",
                    prompt: "发光贝壳道具",
                    assetRefs: [
                        { assetId: "asset-old", kind: "image", role: "selected" },
                        { assetId: "asset-old", kind: "image", role: "selected" },
                    ],
                },
            ],
        });

        const result = await selectCastAssetReference({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            kind: "prop",
            entityId: "prop-1",
            assetId: "asset-external",
        });

        expect(result.episode.props[0].assetRefs).toEqual([
            { assetId: "asset-old", kind: "image", role: "candidate" },
            { assetId: "asset-external", kind: "image", role: "selected" },
        ]);
    });

    it("removes a Cast candidate relationship without touching selected refs or snapshots", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            characters: [
                {
                    id: "char-1",
                    name: "阿岚",
                    description: "夜班店员",
                    prompt: "阿岚角色参考图",
                    assetRefs: [
                        { assetId: "asset-selected", kind: "image", role: "selected" },
                        { assetId: "asset-remove", kind: "image", role: "candidate", metadata: { source: "studio-cast" } },
                        { assetId: "asset-keep", kind: "image", role: "candidate" },
                    ],
                    generation: { image: { status: "completed", lastEffectivePrompt: "保留生成快照" } },
                },
            ],
        });

        const result = await removeCastCandidateReference({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            kind: "character",
            entityId: "char-1",
            assetId: "asset-remove",
        });

        expect(result.episode.characters[0]).toMatchObject({
            assetRefs: [
                { assetId: "asset-selected", kind: "image", role: "selected" },
                { assetId: "asset-keep", kind: "image", role: "candidate" },
            ],
            prompt: "阿岚角色参考图",
            generation: { image: { status: "completed", lastEffectivePrompt: "保留生成快照" } },
        });
    });

    it("does not remove selected Cast refs through the candidate removal operation", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            scenes: [
                {
                    id: "scene-1",
                    name: "便利店",
                    description: "雨夜街角",
                    prompt: "雨夜街角便利店",
                    assetRefs: [
                        { assetId: "asset-selected", kind: "image", role: "selected" },
                        { assetId: "asset-candidate", kind: "image", role: "candidate" },
                    ],
                },
            ],
        });

        await expect(
            removeCastCandidateReference({
                repository,
                seriesId: series.id,
                episodeId: episode.id,
                kind: "scene",
                entityId: "scene-1",
                assetId: "asset-selected",
            }),
        ).rejects.toThrow("只能移除 candidate 参考图");

        await expect(repository.getSeries(series.id)).resolves.toMatchObject({
            episodes: [
                expect.objectContaining({
                    scenes: [
                        expect.objectContaining({
                            assetRefs: [
                                { assetId: "asset-selected", kind: "image", role: "selected" },
                                { assetId: "asset-candidate", kind: "image", role: "candidate" },
                            ],
                        }),
                    ],
                }),
            ],
        });
    });

    it("adds an image asset from the library as a Cast candidate with source metadata", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            props: [{ id: "prop-1", name: "贝壳", description: "会发光", prompt: "发光贝壳道具", assetRefs: [] }],
        });

        const result = await addCastAssetReference({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            kind: "prop",
            entityId: "prop-1",
            asset: { id: "asset-library-image", kind: "image" },
            role: "candidate",
            now: () => "2026-07-03T12:00:00.000Z",
        });

        expect(result.episode.props[0].assetRefs).toEqual([
            {
                assetId: "asset-library-image",
                kind: "image",
                role: "candidate",
                note: "从素材库加入 Cast 参考池",
                metadata: {
                    source: "asset-library",
                    entityKind: "prop",
                    entityId: "prop-1",
                    createdAt: "2026-07-03T12:00:00.000Z",
                },
            },
        ]);
    });

    it("selects a library image while demoting the previous selected ref and deduping repeats", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            characters: [
                {
                    id: "char-1",
                    name: "阿岚",
                    description: "夜班店员",
                    prompt: "阿岚角色参考图",
                    assetRefs: [
                        { assetId: "asset-old", kind: "image", role: "selected" },
                        { assetId: "asset-library-image", kind: "image", role: "candidate", metadata: { source: "asset-library", createdAt: "old" } },
                    ],
                },
            ],
        });

        const result = await addCastAssetReference({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            kind: "character",
            entityId: "char-1",
            asset: { id: "asset-library-image", kind: "image" },
            role: "selected",
            now: () => "2026-07-03T12:05:00.000Z",
        });

        expect(result.episode.characters[0].assetRefs).toEqual([
            { assetId: "asset-old", kind: "image", role: "candidate" },
            { assetId: "asset-library-image", kind: "image", role: "selected", metadata: { source: "asset-library", createdAt: "old" } },
        ]);
    });

    it("rejects non-image assets when attaching library assets to Cast", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            scenes: [{ id: "scene-1", name: "便利店", description: "雨夜街角", prompt: "雨夜街角便利店", assetRefs: [] }],
        });

        await expect(
            addCastAssetReference({
                repository,
                seriesId: series.id,
                episodeId: episode.id,
                kind: "scene",
                entityId: "scene-1",
                asset: { id: "asset-video", kind: "video" },
                role: "candidate",
            }),
        ).rejects.toThrow("只能加入图片素材");
    });

    it("saves edited Cast entity prompts through the repository boundary", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            scenes: [{ id: "scene-1", name: "便利店", description: "雨夜街角", prompt: "旧场景 prompt", assetRefs: [] }],
        });

        const result = await updateCastEntityPrompt({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            kind: "scene",
            entityId: "scene-1",
            prompt: "新的雨夜便利店场景参考图",
        });

        expect(result.episode.scenes[0].prompt).toBe("新的雨夜便利店场景参考图");
        await expect(repository.getSeries(series.id)).resolves.toMatchObject({
            episodes: [expect.objectContaining({ scenes: [expect.objectContaining({ prompt: "新的雨夜便利店场景参考图" })] })],
        });
    });
});
