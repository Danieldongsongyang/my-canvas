import { describe, expect, it } from "vitest";

import {
    buildCastSections,
    buildStoryboardCards,
    buildStudioModelPreferencesPatch,
    buildStudioModelSummary,
    buildStudioPipelineSteps,
    FOLLOW_GLOBAL_MODEL_VALUE,
    formatEpisodeStructure,
    normalizeArtDirectionDraft,
    STUDIO_STYLE_PRESETS,
} from "./studio-workspace-model";
import type { AiConfig } from "@/stores/use-config-store";
import type { StudioEpisode } from "@/services/studio-local";

function episode(overrides: Partial<StudioEpisode> = {}): StudioEpisode {
    return {
        id: "episode-1",
        title: "Episode 01",
        order: 1,
        script: "",
        characters: [],
        scenes: [],
        props: [],
        shots: [],
        createdAt: "2026-07-01T08:00:00.000Z",
        updatedAt: "2026-07-01T08:00:00.000Z",
        ...overrides,
    };
}

describe("studio workspace model", () => {
    it("builds Studio model preference patches and clears follow-global selections", () => {
        expect(
            buildStudioModelPreferencesPatch({
                textModel: "gpt-5.5",
                imageModel: FOLLOW_GLOBAL_MODEL_VALUE,
                videoModel: "sora-1",
            }),
        ).toEqual({
            modelPreferences: {
                textModel: "gpt-5.5",
                imageModel: undefined,
                videoModel: "sora-1",
            },
        });
    });

    it("summarizes Studio model preferences with global fallbacks", () => {
        const config = {
            model: "gpt-5",
            textModel: "gpt-5.5",
            imageModel: "seedream-4",
            videoModel: "sora-1",
        } as AiConfig;

        expect(buildStudioModelSummary({ textModel: "claude-sonnet-5", imageModel: "", videoModel: "kling-v3" }, config)).toEqual([
            { key: "textModel", label: "文本", value: "claude-sonnet-5", source: "project" },
            { key: "imageModel", label: "图像", value: "seedream-4", source: "global" },
            { key: "videoModel", label: "视频", value: "kling-v3", source: "project" },
        ]);
    });

    it("uses the LumenX unified R2V step order for the Studio rail", () => {
        expect(buildStudioPipelineSteps(episode()).map((step) => step.id)).toEqual(["script", "art_direction", "cast", "storyboard_r2v", "assembly"]);
        expect(buildStudioPipelineSteps(episode()).map((step) => step.label)).toEqual(["1. Script", "2. Art Direction", "3. Cast", "4. Storyboard", "5. Assembly"]);
    });

    it("marks rail steps from current episode content without inventing completion", () => {
        const steps = buildStudioPipelineSteps(
            episode({
                characters: [{ id: "c1", name: "阿岚", description: "夜班店员", prompt: "阿岚角色参考图", assetRefs: [] }],
                scenes: [{ id: "s1", name: "便利店", description: "雨夜街角", prompt: "雨夜街角便利店", assetRefs: [] }],
                shots: [{ id: "shot-1", title: "开场", order: 1, description: "便利店亮灯", assetRefs: [] }],
                generation: {
                    scriptParser: { status: "completed" },
                    artDirection: { status: "completed" },
                },
            }),
        );

        expect(steps).toMatchObject([
            { id: "script", status: "ready", statusLabel: "已解析" },
            { id: "art_direction", status: "ready", statusLabel: "已设定" },
            { id: "cast", status: "ready", statusLabel: "1 角色" },
            { id: "storyboard_r2v", status: "ready", statusLabel: "1 镜头" },
            { id: "assembly", status: "idle", statusLabel: "待组装" },
        ]);
    });

    it("formats the editable ScriptProcessor structure draft from episode entities", () => {
        expect(
            formatEpisodeStructure(
                episode({
                    characters: [{ id: "c1", name: "阿岚", description: "夜班店员", prompt: "阿岚角色参考图", assetRefs: [] }],
                    scenes: [{ id: "s1", name: "便利店", description: "雨夜街角", prompt: "雨夜街角便利店", assetRefs: [] }],
                    props: [{ id: "p1", name: "贝壳", description: "发光", prompt: "发光贝壳道具", assetRefs: [] }],
                    shots: [{ id: "shot-1", title: "开场", order: 1, description: "便利店亮灯", dialogue: "又是这个点。", assetRefs: [] }],
                }),
            ),
        ).toBe(
            JSON.stringify(
                {
                    characters: [{ name: "阿岚", description: "夜班店员", prompt: "阿岚角色参考图" }],
                    scenes: [{ name: "便利店", description: "雨夜街角", prompt: "雨夜街角便利店" }],
                    props: [{ name: "贝壳", description: "发光", prompt: "发光贝壳道具" }],
                    shotDrafts: [{ title: "开场", description: "便利店亮灯", dialogue: "又是这个点。" }],
                },
                null,
                2,
            ),
        );
    });

    it("normalizes ArtDirection drafts into saved episode generation metadata", () => {
        const draft = normalizeArtDirectionDraft({
            presetId: STUDIO_STYLE_PRESETS[0].id,
            name: STUDIO_STYLE_PRESETS[0].name,
            positivePrompt: "cinematic ink, rainy neon",
            negativePrompt: "low quality, blurry",
        });

        expect(draft).toMatchObject({
            status: "completed",
            presetId: STUDIO_STYLE_PRESETS[0].id,
            name: STUDIO_STYLE_PRESETS[0].name,
            positivePrompt: "cinematic ink, rainy neon",
            negativePrompt: "low quality, blurry",
        });
        expect(typeof draft.savedAt).toBe("string");
    });

    it("builds Cast sections from current episode entities and shot mentions", () => {
        const sections = buildCastSections(
            episode({
                characters: [
                    { id: "c1", name: "阿岚", description: "夜班店员", prompt: "阿岚角色参考图", assetRefs: [] },
                    { id: "c2", name: "青蛇", description: "神秘访客", prompt: "青蛇角色参考图", assetRefs: [] },
                ],
                scenes: [{ id: "s1", name: "便利店", description: "雨夜街角", prompt: "雨夜街角便利店", assetRefs: [] }],
                props: [{ id: "p1", name: "贝壳", description: "会发光", prompt: "发光贝壳道具", assetRefs: [] }],
                shots: [
                    { id: "shot-1", title: "阿岚开门", order: 1, description: "便利店门铃响起，阿岚看见贝壳", assetRefs: [] },
                    { id: "shot-2", title: "青蛇登场", order: 2, description: "青蛇走进便利店", assetRefs: [] },
                ],
            }),
        );

        expect(sections.map((section) => section.id)).toEqual(["characters", "scenes", "props"]);
        expect(sections[0].items).toMatchObject([
            { id: "c1", name: "阿岚", appearances: 2, status: "pending" },
            { id: "c2", name: "青蛇", appearances: 2, status: "pending" },
        ]);
        expect(sections[1].items[0]).toMatchObject({ name: "便利店", appearances: 2 });
        expect(sections[2].items[0]).toMatchObject({ name: "贝壳", appearances: 1 });
    });

    it("derives Cast selected image, variants and status from image assetRefs", () => {
        const sections = buildCastSections(
            episode({
                characters: [
                    {
                        id: "ready",
                        name: "阿岚",
                        description: "夜班店员",
                        prompt: "阿岚角色参考图",
                        assetRefs: [
                            { assetId: "asset-selected", kind: "image", role: "selected" },
                            { assetId: "asset-candidate", kind: "image", role: "candidate" },
                        ],
                    },
                    {
                        id: "candidate-only",
                        name: "青蛇",
                        description: "神秘访客",
                        prompt: "青蛇角色参考图",
                        assetRefs: [{ assetId: "asset-candidate-only", kind: "image", role: "candidate" }],
                    },
                    {
                        id: "text-selected",
                        name: "老板",
                        description: "只绑定了文本设定",
                        prompt: "老板角色参考图",
                        assetRefs: [{ assetId: "asset-text", kind: "text", role: "selected" }],
                    },
                    {
                        id: "failed",
                        name: "客人",
                        description: "生成失败",
                        prompt: "客人角色参考图",
                        assetRefs: [],
                        generation: { image: { status: "failed", lastImageError: "模型拒绝生成" } },
                    },
                    {
                        id: "generating",
                        name: "巡夜人",
                        description: "正在生成",
                        prompt: "巡夜人角色参考图",
                        assetRefs: [],
                        generation: { image: { status: "processing" } },
                    },
                ],
            }),
        );

        expect(sections[0].items).toMatchObject([
            { id: "ready", status: "ready", selectedAssetId: "asset-selected", candidateCount: 2, lastError: undefined },
            { id: "candidate-only", status: "pending", selectedAssetId: undefined, candidateCount: 1 },
            { id: "text-selected", status: "pending", selectedAssetId: undefined, candidateCount: 0 },
            { id: "failed", status: "failed", lastError: "模型拒绝生成" },
            { id: "generating", status: "generating" },
        ]);
    });

    it("builds lightweight StoryboardR2V cards from ordered episode shots", () => {
        expect(
            buildStoryboardCards(
                episode({
                    shots: [
                        { id: "shot-2", title: "第二镜", order: 2, description: "青蛇回头", dialogue: "你终于来了。", assetRefs: [] },
                        { id: "shot-1", title: "第一镜", order: 1, description: "雨落在玻璃门上", assetRefs: [] },
                    ],
                }),
            ),
        ).toMatchObject([
            { id: "shot-1", title: "第一镜", order: 1, prompt: "雨落在玻璃门上", hasDialogue: false },
            { id: "shot-2", title: "第二镜", order: 2, prompt: "青蛇回头\n对白：你终于来了。", hasDialogue: true },
        ]);
    });
});
