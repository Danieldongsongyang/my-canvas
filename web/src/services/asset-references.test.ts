import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "@/app/(user)/canvas/types";
import type { CanvasProject } from "@/app/(user)/canvas/stores/use-canvas-store";
import { createInMemoryStudioStorage, createStudioRepository, type StudioAssetRef, type StudioSeries } from "@/services/studio-local";
import { checkAssetDeletion, findAssetReferences } from "./asset-references";

function canvasProject(nodes: CanvasNodeData[]): CanvasProject {
    return {
        id: "canvas-1",
        title: "分镜草图",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        nodes,
        connections: [],
        groups: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: { x: 0, y: 0, k: 1 },
    };
}

const assetRef = (assetId: string): StudioAssetRef => ({ assetId, kind: "image", role: "candidate" });

describe("asset reference boundary", () => {
    it("allows deleting an asset when Studio and Canvas do not reference it", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());

        await expect(checkAssetDeletion("asset-free", { studioRepository: repository, canvasProjects: [] })).resolves.toEqual({
            canDelete: true,
            references: [],
        });
    });

    it("blocks deleting an asset referenced by Studio and reports the location", async () => {
        const repository = createStudioRepository(createInMemoryStudioStorage());
        const series = await repository.createSeries({ title: "山海便利店" });
        const episode = series.episodes[0];
        await repository.updateEpisode(series.id, episode.id, {
            shots: [{ id: "shot-1", title: "开场镜头", order: 1, description: "便利店亮灯", assetRefs: [assetRef("asset-image")] }],
        });

        await expect(checkAssetDeletion("asset-image", { studioRepository: repository, canvasProjects: [] })).resolves.toMatchObject({
            canDelete: false,
            references: [
                {
                    source: "studio",
                    assetId: "asset-image",
                    label: "山海便利店 / Episode 01 / 开场镜头",
                    seriesId: series.id,
                    episodeId: episode.id,
                    itemId: "shot-1",
                },
            ],
        });
    });

    it("blocks deleting an asset referenced by Canvas nodes and reports the location", async () => {
        const references = findAssetReferences("asset-image", {
            studioSeries: [],
            canvasProjects: [
                canvasProject([
                    {
                        id: "node-1",
                        type: CanvasNodeType.Image,
                        title: "角色参考图",
                        position: { x: 0, y: 0 },
                        width: 320,
                        height: 240,
                        metadata: { assetRef: { assetId: "asset-image", kind: "image", role: "reference" } },
                    },
                ]),
            ],
        });

        expect(references).toEqual([
            {
                source: "canvas",
                assetId: "asset-image",
                label: "分镜草图 / 角色参考图",
                canvasId: "canvas-1",
                nodeId: "node-1",
            },
        ]);
    });

    it("reports multiple Studio and Canvas references for the same asset", async () => {
        const series = {
            id: "series-1",
            title: "山海便利店",
            summary: "",
            stylePrompt: "",
            modelPreferences: {},
            episodes: [
                {
                    id: "episode-1",
                    title: "Episode 01",
                    order: 1,
                    script: "",
                    characters: [{ id: "char-1", name: "阿岚", description: "", prompt: "阿岚角色参考图", assetRefs: [assetRef("asset-image")] }],
                    scenes: [],
                    props: [],
                    shots: [{ id: "shot-1", title: "开场镜头", order: 1, description: "", assetRefs: [assetRef("asset-image")] }],
                    createdAt: "2026-07-01T00:00:00.000Z",
                    updatedAt: "2026-07-01T00:00:00.000Z",
                },
            ],
            sharedCharacters: [],
            sharedScenes: [],
            sharedProps: [],
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z",
        } satisfies StudioSeries;

        const references = findAssetReferences("asset-image", {
            studioSeries: [series],
            canvasProjects: [
                canvasProject([
                    {
                        id: "node-1",
                        type: CanvasNodeType.Image,
                        title: "角色参考图",
                        position: { x: 0, y: 0 },
                        width: 320,
                        height: 240,
                        metadata: { assetRef: { assetId: "asset-image", kind: "image" } },
                    },
                ]),
            ],
        });

        expect(references.map((reference) => reference.label)).toEqual(["山海便利店 / Episode 01 / 阿岚", "山海便利店 / Episode 01 / 开场镜头", "分镜草图 / 角色参考图"]);
    });

    it("reports selected and candidate Cast image refs as protected Studio asset references", () => {
        const series = {
            id: "series-1",
            title: "山海便利店",
            summary: "",
            stylePrompt: "",
            modelPreferences: {},
            episodes: [
                {
                    id: "episode-1",
                    title: "Episode 01",
                    order: 1,
                    script: "",
                    characters: [
                        { id: "char-1", name: "阿岚", description: "", prompt: "阿岚角色参考图", assetRefs: [{ assetId: "asset-selected", kind: "image" as const, role: "selected" as const }] },
                        { id: "char-2", name: "青蛇", description: "", prompt: "青蛇角色参考图", assetRefs: [{ assetId: "asset-candidate", kind: "image" as const, role: "candidate" as const }] },
                    ],
                    scenes: [],
                    props: [],
                    shots: [],
                    createdAt: "2026-07-01T00:00:00.000Z",
                    updatedAt: "2026-07-01T00:00:00.000Z",
                },
            ],
            sharedCharacters: [],
            sharedScenes: [],
            sharedProps: [],
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z",
        } satisfies StudioSeries;

        expect(findAssetReferences("asset-selected", { studioSeries: [series], canvasProjects: [] }).map((reference) => reference.label)).toEqual(["山海便利店 / Episode 01 / 阿岚"]);
        expect(findAssetReferences("asset-candidate", { studioSeries: [series], canvasProjects: [] }).map((reference) => reference.label)).toEqual(["山海便利店 / Episode 01 / 青蛇"]);
    });
});
