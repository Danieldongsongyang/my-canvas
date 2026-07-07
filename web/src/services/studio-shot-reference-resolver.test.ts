import { describe, expect, it } from "vitest";

import { resolveStudioShotReferences } from "./studio-shot-reference-resolver";
import type { StudioEpisode, StudioShot, StudioShotReferences } from "./studio-local";
import type { Asset } from "@/stores/use-asset-store";

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

function imageAsset(id: string, title: string): Extract<Asset, { kind: "image" }> {
    return {
        id,
        kind: "image",
        title,
        coverUrl: `blob:${id}`,
        tags: [],
        source: "Studio Cast",
        data: {
            dataUrl: `blob:${id}`,
            storageKey: `image:${id}`,
            width: 1024,
            height: 1024,
            bytes: 100,
            mimeType: "image/png",
        },
        createdAt: "",
        updatedAt: "",
    };
}

const shot = (references: StudioShotReferences): StudioShot => ({
    id: "shot-1",
    title: "开场",
    order: 1,
    description: "描述",
    assetRefs: [],
    metadata: { references },
});

describe("studio shot reference resolver", () => {
    it("resolves ready Cast selected images for explicit character, scene and prop references", () => {
        const resolved = resolveStudioShotReferences({
            episode: episode({
                characters: [{ id: "char-1", name: "阿岚", description: "", prompt: "", assetRefs: [{ assetId: "asset-char", kind: "image", role: "selected" }] }],
                scenes: [{ id: "scene-1", name: "便利店", description: "", prompt: "", assetRefs: [{ assetId: "asset-scene", kind: "image", role: "selected" }] }],
                props: [{ id: "prop-1", name: "贝壳", description: "", prompt: "", assetRefs: [{ assetId: "asset-prop", kind: "image", role: "selected" }] }],
            }),
            shot: shot({ characterIds: ["char-1"], sceneIds: ["scene-1"], propIds: ["prop-1"] }),
            assets: [imageAsset("asset-char", "阿岚图"), imageAsset("asset-scene", "便利店图"), imageAsset("asset-prop", "贝壳图")],
        });

        expect(resolved).toMatchObject({
            hasExplicitReferences: true,
            referenceCount: 3,
            readyCount: 3,
            missing: [],
            chips: [
                { kind: "character", id: "char-1", label: "阿岚", ready: true, selectedAssetId: "asset-char" },
                { kind: "scene", id: "scene-1", label: "便利店", ready: true, selectedAssetId: "asset-scene" },
                { kind: "prop", id: "prop-1", label: "贝壳", ready: true, selectedAssetId: "asset-prop" },
            ],
            referenceImages: [
                { id: "asset-char", name: "阿岚图", storageKey: "image:asset-char" },
                { id: "asset-scene", name: "便利店图", storageKey: "image:asset-scene" },
                { id: "asset-prop", name: "贝壳图", storageKey: "image:asset-prop" },
            ],
        });
    });

    it("reports missing entities and missing selected images consistently", () => {
        const resolved = resolveStudioShotReferences({
            episode: episode({
                characters: [{ id: "char-1", name: "阿岚", description: "", prompt: "", assetRefs: [] }],
                scenes: [{ id: "scene-1", name: "便利店", description: "", prompt: "", assetRefs: [{ assetId: "asset-scene", kind: "image", role: "selected" }] }],
            }),
            shot: shot({ characterIds: ["char-1", "char-missing"], sceneIds: ["scene-1"], propIds: ["prop-missing"] }),
            assets: [],
        });

        expect(resolved.readyCount).toBe(0);
        expect(resolved.missing).toEqual([
            { kind: "character", id: "char-1", label: "阿岚", reason: "missing-selected-image" },
            { kind: "character", id: "char-missing", label: "char-missing", reason: "missing-entity" },
            { kind: "scene", id: "scene-1", label: "便利店", reason: "missing-selected-image" },
            { kind: "prop", id: "prop-missing", label: "prop-missing", reason: "missing-entity" },
        ]);
    });

    it("treats empty explicit references as intentional no-reference state", () => {
        const resolved = resolveStudioShotReferences({
            episode: episode({
                characters: [{ id: "char-1", name: "阿岚", description: "", prompt: "", assetRefs: [{ assetId: "asset-char", kind: "image", role: "selected" }] }],
            }),
            shot: shot({ characterIds: [], sceneIds: [], propIds: [] }),
            assets: [imageAsset("asset-char", "阿岚图")],
        });

        expect(resolved).toMatchObject({
            hasExplicitReferences: false,
            referenceCount: 0,
            readyCount: 0,
            chips: [],
            missing: [],
            referenceImages: [],
        });
    });

    it("dedupes duplicate ids while preserving stable character, scene and prop ordering", () => {
        const resolved = resolveStudioShotReferences({
            episode: episode({
                characters: [
                    { id: "char-1", name: "阿岚", description: "", prompt: "", assetRefs: [{ assetId: "asset-char-1", kind: "image", role: "selected" }] },
                    { id: "char-2", name: "青蛇", description: "", prompt: "", assetRefs: [{ assetId: "asset-char-2", kind: "image", role: "selected" }] },
                ],
                scenes: [{ id: "scene-1", name: "便利店", description: "", prompt: "", assetRefs: [{ assetId: "asset-scene", kind: "image", role: "selected" }] }],
                props: [{ id: "prop-1", name: "贝壳", description: "", prompt: "", assetRefs: [{ assetId: "asset-prop", kind: "image", role: "selected" }] }],
            }),
            shot: shot({ characterIds: ["char-2", "char-1", "char-2"], sceneIds: ["scene-1", "scene-1"], propIds: ["prop-1"] }),
            assets: [imageAsset("asset-prop", "贝壳图"), imageAsset("asset-scene", "便利店图"), imageAsset("asset-char-1", "阿岚图"), imageAsset("asset-char-2", "青蛇图")],
        });

        expect(resolved.normalizedReferences).toEqual({ characterIds: ["char-2", "char-1"], sceneIds: ["scene-1"], propIds: ["prop-1"] });
        expect(resolved.chips.map((chip) => `${chip.kind}:${chip.id}`)).toEqual(["character:char-2", "character:char-1", "scene:scene-1", "prop:prop-1"]);
        expect(resolved.referenceImages.map((image) => image.id)).toEqual(["asset-char-2", "asset-char-1", "asset-scene", "asset-prop"]);
    });
});
