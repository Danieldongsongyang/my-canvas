import type { StudioAssetRef, StudioCharacter, StudioEpisode, StudioProp, StudioScene, StudioShot, StudioShotReferences } from "./studio-local";
import type { Asset } from "@/stores/use-asset-store";
import type { ReferenceImage } from "@/types/image";

export type StudioShotReferenceKind = "character" | "scene" | "prop";

export type StudioShotReferenceChip = {
    kind: StudioShotReferenceKind;
    id: string;
    label: string;
    ready: boolean;
    selectedAssetId?: string;
};

export type StudioShotMissingReference = {
    kind: StudioShotReferenceKind;
    id: string;
    label: string;
    reason: "missing-selected-image" | "missing-entity";
};

export type StudioShotResolvedReference = StudioShotReferenceChip & {
    referenceImage: ReferenceImage;
};

export type StudioShotReferenceResolution = {
    normalizedReferences: StudioShotReferences;
    referenceCount: number;
    readyCount: number;
    hasExplicitReferences: boolean;
    hasReadyReferences: boolean;
    chips: StudioShotReferenceChip[];
    missing: StudioShotMissingReference[];
    ready: StudioShotResolvedReference[];
    referenceImages: ReferenceImage[];
};

type StudioCastEntity = StudioCharacter | StudioScene | StudioProp;
type StudioImageAsset = Extract<Asset, { kind: "image" }>;
type StudioShotReferenceEntry = StudioShotReferenceChip & {
    referenceImage?: ReferenceImage;
    missing?: StudioShotMissingReference;
};
type ResolveStudioShotReferencesInput = {
    episode: StudioEpisode;
    shot: StudioShot;
    assets?: Asset[];
    references?: StudioShotReferences;
};

export function resolveStudioShotReferences(input: ResolveStudioShotReferencesInput): StudioShotReferenceResolution {
    const { episode, shot, assets = [], references } = input;
    const assetMap = buildImageAssetMap(assets);
    const normalizedReferences = normalizeShotReferences(references ?? shot.metadata?.references);
    const entries = buildReferenceEntries(episode, normalizedReferences, assetMap);
    const chips = entries.map(toReferenceChip);
    const missing = entries.flatMap((entry) => (entry.missing ? [entry.missing] : []));
    const ready = entries.flatMap(toReadyReference);
    const referenceImages = ready.map((entry) => entry.referenceImage);
    const referenceCount = entries.length;

    return {
        normalizedReferences,
        referenceCount,
        readyCount: ready.length,
        hasExplicitReferences: referenceCount > 0,
        hasReadyReferences: referenceCount > 0 && ready.length === referenceCount,
        chips,
        missing,
        ready,
        referenceImages,
    };
}

export function readNormalizedShotReferences(shot: StudioShot): StudioShotReferences {
    return normalizeShotReferences(shot.metadata?.references);
}

export function normalizeShotReferences(references: Partial<StudioShotReferences> | undefined): StudioShotReferences {
    return {
        characterIds: normalizeReferenceIds(references?.characterIds),
        sceneIds: normalizeReferenceIds(references?.sceneIds),
        propIds: normalizeReferenceIds(references?.propIds),
    };
}

function buildImageAssetMap(assets: Asset[]) {
    return new Map(assets.filter((asset): asset is StudioImageAsset => asset.kind === "image").map((asset) => [asset.id, asset]));
}

function buildReferenceEntries(episode: StudioEpisode, references: StudioShotReferences, assetMap: Map<string, StudioImageAsset>): StudioShotReferenceEntry[] {
    return [
        ...references.characterIds.map((id) => resolveReferenceEntry("character", id, episode.characters, assetMap)),
        ...references.sceneIds.map((id) => resolveReferenceEntry("scene", id, episode.scenes, assetMap)),
        ...references.propIds.map((id) => resolveReferenceEntry("prop", id, episode.props, assetMap)),
    ];
}

function resolveReferenceEntry(kind: StudioShotReferenceKind, id: string, entities: StudioCastEntity[], assetMap: Map<string, StudioImageAsset>): StudioShotReferenceEntry {
    const entity = entities.find((item) => item.id === id);
    if (!entity) {
        return {
            kind,
            id,
            label: id,
            ready: false,
            missing: { kind, id, label: id, reason: "missing-entity" },
        };
    }

    const selectedRef = getSelectedImageRef(entity.assetRefs);
    const asset = selectedRef ? assetMap.get(selectedRef.assetId) : undefined;
    const referenceImage = asset ? toReferenceImage(asset) : undefined;
    return {
        kind,
        id,
        label: entity.name,
        ready: Boolean(referenceImage),
        selectedAssetId: selectedRef?.assetId,
        referenceImage,
        missing: referenceImage ? undefined : { kind, id, label: entity.name, reason: "missing-selected-image" },
    };
}

function toReferenceChip(entry: StudioShotReferenceEntry): StudioShotReferenceChip {
    const chip: StudioShotReferenceChip = {
        kind: entry.kind,
        id: entry.id,
        label: entry.label,
        ready: entry.ready,
    };
    if ("selectedAssetId" in entry) chip.selectedAssetId = entry.selectedAssetId;
    return chip;
}

function toReadyReference(entry: StudioShotReferenceEntry): StudioShotResolvedReference[] {
    if (!entry.referenceImage) return [];
    return [
        {
            ...toReferenceChip(entry),
            referenceImage: entry.referenceImage,
        },
    ];
}

function normalizeReferenceIds(ids: unknown) {
    if (!Array.isArray(ids)) return [];
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const id of ids) {
        if (typeof id !== "string") continue;
        const value = id.trim();
        if (!value || seen.has(value)) continue;
        seen.add(value);
        normalized.push(value);
    }
    return normalized;
}

function getSelectedImageRef(refs: StudioAssetRef[]) {
    return refs.find((ref) => ref.kind === "image" && ref.role === "selected");
}

function toReferenceImage(asset: StudioImageAsset): ReferenceImage {
    return {
        id: asset.id,
        name: asset.title,
        dataUrl: asset.data.dataUrl,
        url: asset.data.dataUrl,
        storageKey: asset.data.storageKey,
        type: asset.data.mimeType,
    };
}
