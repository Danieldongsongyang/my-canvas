import { describe, expect, it, vi } from "vitest";

import { createInMemoryStudioStorage, createStudioRepository } from "@/services/studio-local";
import {
    addCastAssetReference,
    generateMissingStoryboardShotImages,
    generateStoryboardShotImages,
    generateCastReferences,
    normalizeScriptStructure,
    parseAndApplyScript,
    parseScript,
    removeCastCandidateReference,
    removeStoryboardShotCandidateReference,
    selectCastAssetReference,
    selectStoryboardShotAssetReference,
    StudioGenerationError,
    updateCastEntityPrompt,
    updateShotPrompt,
    updateShotReferences,
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
            prompt: "wide cinematic shot, A Lan wipes the counter in a rainy neon convenience store",
            references: {
                characters: ["阿岚"],
                scenes: ["山海便利店"],
                props: [],
            },
        },
        {
            title: "贝壳亮起",
            description: "客人放下发光贝壳，货架间映出蓝色海浪。",
            references: {
                characters: [],
                scenes: ["山海便利店"],
                props: ["发光贝壳"],
            },
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
            {
                title: "雨夜开场",
                order: 1,
                description: "霓虹灯下，阿岚擦拭柜台，门口风铃响起。",
                dialogue: "又是这个点。",
                prompt: "wide cinematic shot, A Lan wipes the counter in a rainy neon convenience store",
                assetRefs: [],
                metadata: { references: { characterIds: [expect.any(String)], sceneIds: [expect.any(String)], propIds: [] } },
            },
            {
                title: "贝壳亮起",
                order: 2,
                description: "客人放下发光贝壳，货架间映出蓝色海浪。",
                prompt: "客人放下发光贝壳，货架间映出蓝色海浪。",
                assetRefs: [],
                metadata: { references: { characterIds: [], sceneIds: [expect.any(String)], propIds: [expect.any(String)] } },
            },
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
        expect(result.shots).toMatchObject([{ title: "手工镜头", order: 1, description: "用户自己写的分镜", prompt: "用户自己写的分镜", assetRefs: [], metadata: { references: { characterIds: [], sceneIds: [], propIds: [] } } }]);
    });

    it("preserves manually edited shot prompt and references when saving a structure draft without those fields", () => {
        const result = normalizeScriptStructure(
            {
                characters: [{ id: "char-1", name: "阿岚", description: "夜班店员", prompt: "阿岚角色参考图" }],
                scenes: [{ id: "scene-1", name: "便利店", description: "雨夜街角", prompt: "便利店场景参考图" }],
                props: [],
                shotDrafts: [{ id: "shot-1", title: "开场", description: "新的描述" }],
            },
            {
                previousEpisode: {
                    id: "episode-1",
                    title: "Episode 01",
                    order: 1,
                    script: "",
                    characters: [{ id: "char-1", name: "阿岚", description: "夜班店员", prompt: "阿岚角色参考图", assetRefs: [] }],
                    scenes: [{ id: "scene-1", name: "便利店", description: "雨夜街角", prompt: "便利店场景参考图", assetRefs: [] }],
                    props: [],
                    shots: [
                        {
                            id: "shot-1",
                            title: "开场",
                            order: 1,
                            description: "旧描述",
                            prompt: "用户精修后的镜头 prompt",
                            assetRefs: [],
                            metadata: { references: { characterIds: ["char-1"], sceneIds: ["scene-1"], propIds: [] } },
                        },
                    ],
                    createdAt: "2026-07-01T08:00:00.000Z",
                    updatedAt: "2026-07-01T08:00:00.000Z",
                },
            },
        );

        expect(result.shots?.[0]).toMatchObject({
            id: "shot-1",
            description: "新的描述",
            prompt: "用户精修后的镜头 prompt",
            metadata: { references: { characterIds: ["char-1"], sceneIds: ["scene-1"], propIds: [] } },
        });
        expect(result.characters?.[0].id).toBe("char-1");
        expect(result.scenes?.[0].id).toBe("scene-1");
    });

    it("updates shot prompt without changing explicit references", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            shots: [{ id: "shot-1", title: "开场", order: 1, description: "描述", prompt: "旧 prompt", assetRefs: [], metadata: { references: { characterIds: ["char-1"], sceneIds: [], propIds: [] } } }],
        });

        const result = await updateShotPrompt({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            shotId: "shot-1",
            prompt: "新 prompt",
        });

        expect(result.episode.shots[0]).toMatchObject({
            prompt: "新 prompt",
            description: "描述",
            metadata: { references: { characterIds: ["char-1"], sceneIds: [], propIds: [] } },
        });
    });

    it("updates shot references with validation, dedupe and episode ordering without changing prompt text", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            characters: [
                { id: "char-1", name: "阿岚", description: "", prompt: "阿岚", assetRefs: [] },
                { id: "char-2", name: "青蛇", description: "", prompt: "青蛇", assetRefs: [] },
            ],
            scenes: [{ id: "scene-1", name: "便利店", description: "", prompt: "便利店", assetRefs: [] }],
            props: [{ id: "prop-1", name: "贝壳", description: "", prompt: "贝壳", assetRefs: [] }],
            shots: [{ id: "shot-1", title: "开场", order: 1, description: "描述", dialogue: "对白", prompt: "保留这个 prompt", assetRefs: [], metadata: { references: { characterIds: [], sceneIds: [], propIds: [] } } }],
        });

        const result = await updateShotReferences({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            shotId: "shot-1",
            references: {
                characterIds: ["char-2", "char-1", "char-2"],
                sceneIds: ["scene-1"],
                propIds: ["prop-1"],
            },
        });

        expect(result.episode.shots[0]).toMatchObject({
            prompt: "保留这个 prompt",
            description: "描述",
            dialogue: "对白",
            metadata: { references: { characterIds: ["char-1", "char-2"], sceneIds: ["scene-1"], propIds: ["prop-1"] } },
        });

        await expect(
            updateShotReferences({
                repository,
                seriesId: series.id,
                episodeId: episode.id,
                shotId: "shot-1",
                references: { characterIds: ["missing"], sceneIds: [], propIds: [] },
            }),
        ).rejects.toThrow("镜头引用包含不存在的角色");
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

    it("uses the caller-resolved image model instead of reapplying stored Studio preferences", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const created = await repository.createSeries({ title: "山海便利店" });
        await repository.updateSeries(created.id, { modelPreferences: { imageModel: "removed-project-image-model" } });
        const episode = created.episodes[0];
        await repository.updateEpisode(created.id, episode.id, {
            characters: [{ id: "char-1", name: "阿岚", description: "夜班店员", prompt: "阿岚角色参考图", assetRefs: [] }],
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
        const requestImages = vi.fn(async () => [{ id: "image-1", dataUrl: "data:image/png;base64,AAA" }]);
        const storeImage = vi.fn(async () => ({
            url: "blob:studio-cast-1",
            storageKey: "image:studio-cast-1",
            width: 1024,
            height: 1536,
            bytes: 1234,
            mimeType: "image/png",
        }));

        await generateCastReferences({
            repository,
            seriesId: created.id,
            episodeId: episode.id,
            config: { ...config, model: "seedream-4", imageModel: "seedream-4" },
            target: { mode: "allMissing" },
            count: 1,
            requestImages,
            storeImage,
            addAsset: vi.fn(() => "asset-1"),
        });

        expect(requestImages).toHaveBeenCalledWith(expect.objectContaining({ model: "seedream-4", imageModel: "seedream-4" }), expect.any(String));
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

    it("generates storyboard candidates with Cast selected references through requestEdit and asset-first storage", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            characters: [{ id: "char-1", name: "阿岚", description: "夜班店员", prompt: "阿岚角色参考图", assetRefs: [{ assetId: "asset-char", kind: "image", role: "selected" }] }],
            scenes: [{ id: "scene-1", name: "便利店", description: "雨夜街角", prompt: "便利店场景参考图", assetRefs: [{ assetId: "asset-scene", kind: "image", role: "selected" }] }],
            props: [],
            shots: [{ id: "shot-1", title: "开场", order: 1, description: "描述", prompt: "用户精修镜头 prompt", assetRefs: [], metadata: { references: { characterIds: ["char-1"], sceneIds: ["scene-1"], propIds: [] } } }],
            generation: {
                artDirection: {
                    status: "completed",
                    name: "雨夜霓虹电影感",
                    positivePrompt: "cinematic neon noir",
                    negativePrompt: "low quality",
                    savedAt: "2026-07-01T08:30:00.000Z",
                },
            },
        });
        const requestEdit = vi.fn(async () => [{ id: "image-1", dataUrl: "data:image/png;base64,SHOT" }]);
        const requestGeneration = vi.fn(async () => [{ id: "text-image", dataUrl: "data:image/png;base64,TEXT" }]);
        const storeImage = vi.fn(async () => ({ url: "blob:shot", storageKey: "image:shot", width: 1280, height: 720, bytes: 333, mimeType: "image/png" }));
        const addAsset = vi.fn(() => "asset-shot-1");

        const result = await generateStoryboardShotImages({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            shotId: "shot-1",
            config,
            assets: [
                {
                    id: "asset-char",
                    kind: "image",
                    title: "阿岚",
                    coverUrl: "blob:char",
                    tags: [],
                    source: "Studio Cast",
                    data: { dataUrl: "blob:char", storageKey: "char-key", width: 1024, height: 1024, bytes: 100, mimeType: "image/png" },
                    createdAt: "",
                    updatedAt: "",
                },
                {
                    id: "asset-scene",
                    kind: "image",
                    title: "便利店",
                    coverUrl: "blob:scene",
                    tags: [],
                    source: "Studio Cast",
                    data: { dataUrl: "blob:scene", storageKey: "scene-key", width: 1024, height: 1024, bytes: 100, mimeType: "image/png" },
                    createdAt: "",
                    updatedAt: "",
                },
            ],
            count: 1,
            requestEdit,
            requestGeneration,
            storeImage,
            addAsset,
            now: () => "2026-07-03T13:00:00.000Z",
        });

        expect(requestEdit).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-image-1", imageModel: "gpt-image-1", count: "1", size: "16:9" }), expect.stringContaining("用户精修镜头 prompt"), [
            expect.objectContaining({ id: "asset-char", storageKey: "char-key" }),
            expect.objectContaining({ id: "asset-scene", storageKey: "scene-key" }),
        ]);
        expect(requestGeneration).not.toHaveBeenCalled();
        expect(storeImage).toHaveBeenCalledWith("data:image/png;base64,SHOT");
        expect(addAsset).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: "image",
                title: "开场 分镜图 1",
                source: "Studio Storyboard",
                metadata: expect.objectContaining({
                    source: "studio-storyboard",
                    shotId: "shot-1",
                    prompt: "用户精修镜头 prompt",
                    style: "雨夜霓虹电影感",
                    effectivePrompt: expect.stringContaining("Style baseline:"),
                    model: "gpt-image-1",
                    referenceAssetIds: ["asset-char", "asset-scene"],
                    count: 1,
                    aspectRatio: "16:9",
                    batchId: expect.any(String),
                }),
            }),
        );
        expect(result.episode.shots[0].assetRefs).toMatchObject([
            {
                assetId: "asset-shot-1",
                kind: "image",
                role: "selected",
                metadata: expect.objectContaining({
                    source: "studio-storyboard",
                    effectivePrompt: expect.stringContaining("cinematic neon noir"),
                    referenceAssetIds: ["asset-char", "asset-scene"],
                    count: 1,
                    aspectRatio: "16:9",
                    batchId: expect.any(String),
                }),
            },
        ]);
    });

    it("blocks storyboard generation without ready references unless explicitly allowed", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            shots: [{ id: "shot-1", title: "开场", order: 1, description: "描述", prompt: "镜头 prompt", assetRefs: [{ assetId: "existing", kind: "image", role: "selected" }], metadata: { references: { characterIds: [], sceneIds: [], propIds: [] } } }],
            generation: { artDirection: { status: "completed", name: "风格", positivePrompt: "style", negativePrompt: "", savedAt: "" } },
        });

        await expect(
            generateStoryboardShotImages({
                repository,
                seriesId: series.id,
                episodeId: episode.id,
                shotId: "shot-1",
                config,
                assets: [],
                count: 1,
                addAsset: vi.fn(),
                requestEdit: vi.fn(),
                requestGeneration: vi.fn(),
            }),
        ).rejects.toThrow("缺少 Cast selected reference images");

        await expect(repository.getSeries(series.id)).resolves.toMatchObject({
            episodes: [expect.objectContaining({ shots: [expect.objectContaining({ assetRefs: [{ assetId: "existing", kind: "image", role: "selected" }] })] })],
        });
    });

    it("uses requestGeneration only when storyboard no-reference generation is explicitly allowed and appends later results as candidates", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            shots: [
                { id: "shot-1", title: "开场", order: 1, description: "描述", prompt: "镜头 prompt", assetRefs: [{ assetId: "selected-old", kind: "image", role: "selected" }], metadata: { references: { characterIds: [], sceneIds: [], propIds: [] } } },
            ],
            generation: { artDirection: { status: "completed", name: "风格", positivePrompt: "style", negativePrompt: "", savedAt: "" } },
        });
        const requestGeneration = vi.fn(async () => [
            { id: "image-1", dataUrl: "data:image/png;base64,ONE" },
            { id: "image-2", dataUrl: "data:image/png;base64,TWO" },
        ]);
        const storeImage = vi
            .fn()
            .mockResolvedValueOnce({ url: "blob:one", storageKey: "image:one", width: 1280, height: 720, bytes: 111, mimeType: "image/png" })
            .mockResolvedValueOnce({ url: "blob:two", storageKey: "image:two", width: 1280, height: 720, bytes: 222, mimeType: "image/png" });
        const addAsset = vi.fn().mockReturnValueOnce("asset-one").mockReturnValueOnce("asset-two");

        const result = await generateStoryboardShotImages({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            shotId: "shot-1",
            config,
            assets: [],
            count: 2,
            allowNoReferences: true,
            requestEdit: vi.fn(),
            requestGeneration,
            storeImage,
            addAsset,
            now: () => "2026-07-03T13:05:00.000Z",
        });

        expect(requestGeneration).toHaveBeenCalledWith(expect.objectContaining({ count: "2", size: "16:9" }), expect.stringContaining("镜头 prompt"));
        expect(result.episode.shots[0].assetRefs).toMatchObject([
            { assetId: "selected-old", kind: "image", role: "selected" },
            { assetId: "asset-one", kind: "image", role: "candidate" },
            { assetId: "asset-two", kind: "image", role: "candidate" },
        ]);
    });

    it("promotes a storyboard candidate to selected, demotes the previous selected and keeps one selected image", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            shots: [
                {
                    id: "shot-1",
                    title: "开场",
                    order: 1,
                    description: "描述",
                    assetRefs: [
                        { assetId: "asset-old", kind: "image", role: "selected", metadata: { source: "studio-storyboard" } },
                        { assetId: "asset-next", kind: "image", role: "candidate", metadata: { source: "studio-storyboard" } },
                        { assetId: "asset-duplicate-selected", kind: "image", role: "selected" },
                    ],
                },
            ],
        });

        const result = await selectStoryboardShotAssetReference({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            shotId: "shot-1",
            assetId: "asset-next",
        });

        expect(result.episode.shots[0].assetRefs).toEqual([
            { assetId: "asset-old", kind: "image", role: "candidate", metadata: { source: "studio-storyboard" } },
            { assetId: "asset-next", kind: "image", role: "selected", metadata: { source: "studio-storyboard" } },
            { assetId: "asset-duplicate-selected", kind: "image", role: "candidate" },
        ]);
        expect(result.episode.shots[0].assetRefs.filter((ref) => ref.kind === "image" && ref.role === "selected")).toHaveLength(1);
    });

    it("removes only storyboard candidate refs without deleting or mutating selected refs", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            shots: [
                {
                    id: "shot-1",
                    title: "开场",
                    order: 1,
                    description: "描述",
                    assetRefs: [
                        { assetId: "asset-selected", kind: "image", role: "selected" },
                        { assetId: "asset-remove", kind: "image", role: "candidate", metadata: { batchId: "batch-1" } },
                        { assetId: "asset-keep", kind: "image", role: "candidate" },
                    ],
                    generation: { image: { status: "completed", lastEffectivePrompt: "保留生成摘要" } },
                },
            ],
        });

        const result = await removeStoryboardShotCandidateReference({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            shotId: "shot-1",
            assetId: "asset-remove",
        });

        expect(result.episode.shots[0]).toMatchObject({
            assetRefs: [
                { assetId: "asset-selected", kind: "image", role: "selected" },
                { assetId: "asset-keep", kind: "image", role: "candidate" },
            ],
            generation: { image: { status: "completed", lastEffectivePrompt: "保留生成摘要" } },
        });

        await expect(
            removeStoryboardShotCandidateReference({
                repository,
                seriesId: series.id,
                episodeId: episode.id,
                shotId: "shot-1",
                assetId: "asset-selected",
            }),
        ).rejects.toThrow("只能移除 candidate 分镜图");
    });

    it("batch-generates missing storyboard shots, skips shots without explicit refs and records failed retries", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            characters: [{ id: "char-1", name: "阿岚", description: "夜班店员", prompt: "阿岚", assetRefs: [{ assetId: "asset-char", kind: "image", role: "selected" }] }],
            scenes: [{ id: "scene-1", name: "便利店", description: "雨夜", prompt: "便利店", assetRefs: [] }],
            shots: [
                {
                    id: "shot-ready",
                    title: "已有图",
                    order: 1,
                    description: "描述",
                    prompt: "已有图 prompt",
                    assetRefs: [{ assetId: "asset-shot-ready", kind: "image", role: "selected" }],
                    metadata: { references: { characterIds: ["char-1"], sceneIds: [], propIds: [] } },
                },
                { id: "shot-generate", title: "待生成", order: 2, description: "描述", prompt: "待生成 prompt", assetRefs: [], metadata: { references: { characterIds: ["char-1"], sceneIds: [], propIds: [] } } },
                { id: "shot-missing-ref", title: "缺参考图", order: 3, description: "描述", prompt: "缺参考 prompt", assetRefs: [], metadata: { references: { characterIds: [], sceneIds: ["scene-1"], propIds: [] } } },
                { id: "shot-no-refs", title: "无引用", order: 4, description: "描述", prompt: "无引用 prompt", assetRefs: [], metadata: { references: { characterIds: [], sceneIds: [], propIds: [] } } },
                {
                    id: "shot-failed",
                    title: "失败重试",
                    order: 5,
                    description: "描述",
                    prompt: "失败 prompt",
                    assetRefs: [],
                    generation: { image: { status: "failed", lastImageError: "旧错误" } },
                    metadata: { references: { characterIds: ["char-1"], sceneIds: [], propIds: [] } },
                },
            ],
            generation: { artDirection: { status: "completed", name: "风格", positivePrompt: "style", negativePrompt: "", savedAt: "" } },
        });
        const assets = [
            {
                id: "asset-char",
                kind: "image" as const,
                title: "阿岚",
                coverUrl: "blob:char",
                tags: [],
                source: "Studio Cast",
                data: { dataUrl: "blob:char", storageKey: "char-key", width: 1024, height: 1024, bytes: 100, mimeType: "image/png" },
                createdAt: "",
                updatedAt: "",
            },
        ];
        const requestEdit = vi.fn(async (_nextConfig: AiConfig, prompt: string) => {
            if (prompt.includes("失败 prompt")) throw new Error("重试仍失败");
            return [{ id: "image-1", dataUrl: "data:image/png;base64,SHOT" }];
        });
        const storeImage = vi.fn(async () => ({ url: "blob:shot", storageKey: "image:shot", width: 1280, height: 720, bytes: 333, mimeType: "image/png" }));
        const addAsset = vi.fn(() => "asset-shot-new");

        const result = await generateMissingStoryboardShotImages({
            repository,
            seriesId: series.id,
            episodeId: episode.id,
            config,
            assets,
            target: { mode: "allMissing" },
            count: 1,
            requestEdit,
            storeImage,
            addAsset,
            now: () => "2026-07-03T14:00:00.000Z",
        });

        expect(requestEdit).toHaveBeenCalledTimes(2);
        expect(result.results).toMatchObject([
            { shotId: "shot-generate", status: "completed", createdAssetIds: ["asset-shot-new"], selectedAssetId: "asset-shot-new" },
            { shotId: "shot-missing-ref", status: "skipped", reason: "missing-reference-images" },
            { shotId: "shot-no-refs", status: "skipped", reason: "no-explicit-references" },
            { shotId: "shot-failed", status: "failed", error: "重试仍失败" },
        ]);
        expect(result.episode.shots.find((shot) => shot.id === "shot-ready")?.assetRefs).toEqual([{ assetId: "asset-shot-ready", kind: "image", role: "selected" }]);
        expect(result.episode.shots.find((shot) => shot.id === "shot-generate")?.assetRefs).toMatchObject([{ assetId: "asset-shot-new", kind: "image", role: "selected" }]);
        expect(result.episode.shots.find((shot) => shot.id === "shot-failed")?.generation).toMatchObject({ image: { status: "failed", lastImageError: "重试仍失败" } });
    });
});
