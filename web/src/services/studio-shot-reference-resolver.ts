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
    referenceImage?: ReferenceImage;
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

export function resolveStudioShotReferences(input: { episode: StudioEpisode; shot: StudioShot; assets?: Asset[]; references?: StudioShotReferences }): StudioShotReferenceResolution {
    const assetMap = new Map((input.assets ?? []).filter((asset) => asset.kind === "image").map((asset) => [asset.id, asset]));
    const normalizedReferences = input.references ? normalizeShotReferences(input.references) : readNormalizedShotReferences(input.shot);
    const entries = [
        ...normalizedReferences.characterIds.map((id) => resolveReferenceEntry("character", id, input.episode.characters, assetMap)),
        ...normalizedReferences.sceneIds.map((id) => resolveReferenceEntry("scene", id, input.episode.scenes, assetMap)),
        ...normalizedReferences.propIds.map((id) => resolveReferenceEntry("prop", id, input.episode.props, assetMap)),
    ];
    const chips = entries.map(({ referenceImage: _referenceImage, missing, ...chip }) => chip);
    const missing = entries.flatMap((entry) => (entry.missing ? [entry.missing] : []));
    const ready = entries.filter((entry) => entry.referenceImage).map(({ missing: _missing, ...entry }) => entry);
    const referenceImages = ready.map((entry) => entry.referenceImage).filter((image): image is ReferenceImage => Boolean(image));
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

function resolveReferenceEntry(kind: StudioShotReferenceKind, id: string, entities: StudioCastEntity[], assetMap: Map<string, Extract<Asset, { kind: "image" }>>): StudioShotResolvedReference & { missing?: StudioShotMissingReference } {
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

function normalizeReferenceIds(ids: unknown) {
    if (!Array.isArray(ids)) return [];
    const seen = new Set<string>();
    const normalized: string[] = [];
    ids.forEach((id) => {
        if (typeof id !== "string") return;
        const value = id.trim();
        if (!value || seen.has(value)) return;
        seen.add(value);
        normalized.push(value);
    });
    return normalized;
}

function getSelectedImageRef(refs: StudioAssetRef[]) {
    return refs.find((ref) => ref.kind === "image" && ref.role === "selected");
}

function toReferenceImage(asset: Extract<Asset, { kind: "image" }>): ReferenceImage {
    return {
        id: asset.id,
        name: asset.title,
        dataUrl: asset.data.dataUrl,
        url: asset.data.dataUrl,
        storageKey: asset.data.storageKey,
        type: asset.data.mimeType,
    };
}
