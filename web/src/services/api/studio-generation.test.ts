import { describe, expect, it, vi } from "vitest";

import { createInMemoryStudioStorage, createStudioRepository } from "@/services/studio-local";
import { normalizeScriptStructure, parseAndApplyScript, parseScript, StudioGenerationError } from "@/services/api/studio-generation";
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
    characters: [{ name: "阿岚", description: "夜班店员，外冷内热" }],
    scenes: [{ name: "山海便利店", description: "雨夜里的街角便利店" }],
    props: [{ name: "发光贝壳", description: "能映出海潮记忆" }],
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
        expect(result.characters).toMatchObject([{ name: "阿岚", description: "夜班店员，外冷内热", assetRefs: [] }]);
        expect(result.scenes).toMatchObject([{ name: "山海便利店", description: "雨夜里的街角便利店", assetRefs: [] }]);
        expect(result.props).toMatchObject([{ name: "发光贝壳", description: "能映出海潮记忆", assetRefs: [] }]);
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
            characters: [{ name: " 手工角色 ", description: "手动补充" }],
            scenes: [],
            props: [],
            shotDrafts: [{ title: " 手工镜头 ", description: "用户自己写的分镜" }],
        });

        expect(result.characters).toMatchObject([{ name: "手工角色", description: "手动补充", assetRefs: [] }]);
        expect(result.shots).toMatchObject([{ title: "手工镜头", order: 1, description: "用户自己写的分镜", assetRefs: [] }]);
    });
});
