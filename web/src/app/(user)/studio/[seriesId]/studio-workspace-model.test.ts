import { describe, expect, it } from "vitest";

import { buildStudioPipelineSteps, formatEpisodeStructure } from "./studio-workspace-model";
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
    it("uses the LumenX unified R2V step order for the Studio rail", () => {
        expect(buildStudioPipelineSteps(episode()).map((step) => step.id)).toEqual(["script", "art_direction", "cast", "storyboard_r2v", "assembly"]);
        expect(buildStudioPipelineSteps(episode()).map((step) => step.label)).toEqual(["1. Script", "2. Art Direction", "3. Cast", "4. Storyboard", "5. Assembly"]);
    });

    it("marks rail steps from current episode content without inventing completion", () => {
        const steps = buildStudioPipelineSteps(
            episode({
                characters: [{ id: "c1", name: "阿岚", description: "夜班店员", assetRefs: [] }],
                scenes: [{ id: "s1", name: "便利店", description: "雨夜街角", assetRefs: [] }],
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
                    characters: [{ id: "c1", name: "阿岚", description: "夜班店员", assetRefs: [] }],
                    scenes: [{ id: "s1", name: "便利店", description: "雨夜街角", assetRefs: [] }],
                    props: [{ id: "p1", name: "贝壳", description: "发光", assetRefs: [] }],
                    shots: [{ id: "shot-1", title: "开场", order: 1, description: "便利店亮灯", dialogue: "又是这个点。", assetRefs: [] }],
                }),
            ),
        ).toBe(
            JSON.stringify(
                {
                    characters: [{ name: "阿岚", description: "夜班店员" }],
                    scenes: [{ name: "便利店", description: "雨夜街角" }],
                    props: [{ name: "贝壳", description: "发光" }],
                    shotDrafts: [{ title: "开场", description: "便利店亮灯", dialogue: "又是这个点。" }],
                },
                null,
                2,
            ),
        );
    });
});
