import type { StudioAssetRef } from "@/services/studio-local";

export type StudioImageVariantRole = Extract<StudioAssetRef["role"], "candidate" | "selected">;

type UpsertStudioImageVariantInput = {
    assetId: string;
    role: StudioImageVariantRole;
    createRef?: () => StudioAssetRef;
};

export function getSelectedStudioImageVariant(refs: StudioAssetRef[]): StudioAssetRef | undefined {
    return refs.find((ref) => isStudioImageRef(ref) && ref.role === "selected");
}

export function normalizeStudioImageVariants(refs: StudioAssetRef[]): StudioAssetRef[] {
    const uniqueRefs: StudioAssetRef[] = [];
    const imageIndexByAssetId = new Map<string, number>();

    for (const ref of refs) {
        if (!isStudioImageRef(ref)) {
            uniqueRefs.push(ref);
            continue;
        }

        const existingIndex = imageIndexByAssetId.get(ref.assetId);
        if (existingIndex === undefined) {
            imageIndexByAssetId.set(ref.assetId, uniqueRefs.length);
            uniqueRefs.push(ref);
            continue;
        }

        const existingRef = uniqueRefs[existingIndex];
        if (ref.role === "selected" && existingRef.role !== "selected") {
            uniqueRefs[existingIndex] = withImageVariantRole(existingRef, "selected");
        }
    }

    return keepFirstSelectedImageVariant(uniqueRefs);
}

export function appendStudioImageVariants(refs: StudioAssetRef[], imageRefs: StudioAssetRef[]): StudioAssetRef[] {
    const nextRefs = normalizeStudioImageVariants(refs);
    let hasSelected = Boolean(getSelectedStudioImageVariant(nextRefs));
    const existingImageAssetIds = new Set(nextRefs.filter(isStudioImageRef).map((ref) => ref.assetId));

    for (const ref of imageRefs) {
        if (!isStudioImageRef(ref) || existingImageAssetIds.has(ref.assetId)) continue;
        const role: StudioImageVariantRole = hasSelected ? "candidate" : "selected";
        nextRefs.push(withImageVariantRole(ref, role));
        existingImageAssetIds.add(ref.assetId);
        hasSelected = true;
    }

    return nextRefs;
}

export function selectStudioImageVariant(refs: StudioAssetRef[], assetId: string): StudioAssetRef[] {
    const nextRefs = appendMissingStudioImageVariant(refs, { assetId });

    return nextRefs.map((ref) => {
        if (!isStudioImageRef(ref)) return ref;
        if (ref.assetId === assetId) return withImageVariantRole(ref, "selected");
        if (ref.role === "selected") return withImageVariantRole(ref, "candidate");
        return ref;
    });
}

export function upsertStudioImageVariant(refs: StudioAssetRef[], input: UpsertStudioImageVariantInput): StudioAssetRef[] {
    const nextRefs = appendMissingStudioImageVariant(refs, input);

    if (input.role === "selected") {
        return selectStudioImageVariant(nextRefs, input.assetId);
    }

    return normalizeStudioImageVariants(nextRefs);
}

export function removeStudioImageCandidateVariant(refs: StudioAssetRef[], assetId: string): StudioAssetRef[] {
    const nextRefs = refs.filter((ref) => !(isStudioImageRef(ref) && ref.assetId === assetId && ref.role === "candidate"));
    return normalizeStudioImageVariants(nextRefs);
}

function keepFirstSelectedImageVariant(refs: StudioAssetRef[]): StudioAssetRef[] {
    let selectedSeen = false;
    return refs.map((ref) => {
        if (!isStudioImageRef(ref) || ref.role !== "selected") return ref;
        if (!selectedSeen) {
            selectedSeen = true;
            return ref;
        }
        return withImageVariantRole(ref, "candidate");
    });
}

function appendMissingStudioImageVariant(refs: StudioAssetRef[], input: Pick<UpsertStudioImageVariantInput, "assetId" | "createRef">): StudioAssetRef[] {
    const normalized = normalizeStudioImageVariants(refs);
    if (hasStudioImageRef(normalized, input.assetId)) return normalized;
    return [...normalized, input.createRef?.() ?? createCandidateImageVariant(input.assetId)];
}

function hasStudioImageRef(refs: StudioAssetRef[], assetId: string) {
    return refs.some((ref) => isStudioImageRef(ref) && ref.assetId === assetId);
}

function createCandidateImageVariant(assetId: string): StudioAssetRef {
    return { assetId, kind: "image", role: "candidate" };
}

function withImageVariantRole(ref: StudioAssetRef, role: StudioImageVariantRole): StudioAssetRef {
    return { ...ref, role };
}

function isStudioImageRef(ref: StudioAssetRef): ref is StudioAssetRef & { kind: "image" } {
    return ref.kind === "image";
}
