import type { StudioAssetRef } from "@/services/studio-local";

export type StudioImageVariantRole = "candidate" | "selected";

export function getSelectedStudioImageVariant(refs: StudioAssetRef[]) {
    return refs.find((ref) => ref.kind === "image" && ref.role === "selected");
}

export function normalizeStudioImageVariants(refs: StudioAssetRef[]) {
    const deduped: StudioAssetRef[] = [];
    const imageIndexByAssetId = new Map<string, number>();

    for (const ref of refs) {
        if (ref.kind !== "image") {
            deduped.push(ref);
            continue;
        }

        const existingIndex = imageIndexByAssetId.get(ref.assetId);
        if (existingIndex === undefined) {
            imageIndexByAssetId.set(ref.assetId, deduped.length);
            deduped.push(ref);
            continue;
        }

        if (ref.role === "selected" && deduped[existingIndex].role !== "selected") {
            deduped[existingIndex] = { ...deduped[existingIndex], role: "selected" };
        }
    }

    let selectedSeen = false;
    return deduped.map((ref) => {
        if (ref.kind !== "image" || ref.role !== "selected") return ref;
        if (!selectedSeen) {
            selectedSeen = true;
            return ref;
        }
        return { ...ref, role: "candidate" as const };
    });
}

export function appendStudioImageVariants(refs: StudioAssetRef[], imageRefs: StudioAssetRef[]) {
    const nextRefs = normalizeStudioImageVariants(refs);
    let hasSelected = Boolean(getSelectedStudioImageVariant(nextRefs));
    const existingImageAssetIds = new Set(nextRefs.filter((ref) => ref.kind === "image").map((ref) => ref.assetId));

    for (const ref of imageRefs) {
        if (ref.kind !== "image" || existingImageAssetIds.has(ref.assetId)) continue;
        const role: StudioImageVariantRole = hasSelected ? "candidate" : "selected";
        nextRefs.push({ ...ref, role });
        existingImageAssetIds.add(ref.assetId);
        hasSelected = true;
    }

    return normalizeStudioImageVariants(nextRefs);
}

export function selectStudioImageVariant(refs: StudioAssetRef[], assetId: string) {
    const normalized = normalizeStudioImageVariants(refs);
    if (!normalized.some((ref) => ref.kind === "image" && ref.assetId === assetId)) {
        normalized.push({ assetId, kind: "image", role: "candidate" });
    }

    return normalizeStudioImageVariants(
        normalized.map((ref) => {
            if (ref.kind !== "image") return ref;
            if (ref.assetId === assetId) return { ...ref, role: "selected" as const };
            if (ref.role === "selected") return { ...ref, role: "candidate" as const };
            return ref;
        }),
    );
}

export function upsertStudioImageVariant(refs: StudioAssetRef[], input: { assetId: string; role: StudioImageVariantRole; createRef?: () => StudioAssetRef }) {
    const normalized = normalizeStudioImageVariants(refs);
    const nextRefs = normalized.some((ref) => ref.kind === "image" && ref.assetId === input.assetId)
        ? normalized
        : [
              ...normalized,
              input.createRef?.() ?? {
                  assetId: input.assetId,
                  kind: "image" as const,
                  role: "candidate" as const,
              },
          ];

    if (input.role === "candidate") return normalizeStudioImageVariants(nextRefs);
    return selectStudioImageVariant(nextRefs, input.assetId);
}

export function removeStudioImageCandidateVariant(refs: StudioAssetRef[], assetId: string) {
    return normalizeStudioImageVariants(refs.filter((ref) => !(ref.kind === "image" && ref.assetId === assetId && ref.role === "candidate")));
}
