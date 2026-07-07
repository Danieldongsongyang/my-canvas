import { describe, expect, it } from "vitest";

import { appendStudioImageVariants, normalizeStudioImageVariants, removeStudioImageCandidateVariant, selectStudioImageVariant, upsertStudioImageVariant } from "@/services/studio-image-variants";
import type { StudioAssetRef } from "@/services/studio-local";

describe("studio image variants", () => {
    it("keeps at most one selected image while retaining image candidates and non-image refs", () => {
        const refs: StudioAssetRef[] = [
            { assetId: "image-a", kind: "image", role: "selected" },
            { assetId: "image-b", kind: "image", role: "selected" },
            { assetId: "image-c", kind: "image", role: "candidate" },
            { assetId: "text-a", kind: "text", role: "selected" },
        ];

        expect(normalizeStudioImageVariants(refs)).toEqual([
            { assetId: "image-a", kind: "image", role: "selected" },
            { assetId: "image-b", kind: "image", role: "candidate" },
            { assetId: "image-c", kind: "image", role: "candidate" },
            { assetId: "text-a", kind: "text", role: "selected" },
        ]);
    });

    it("dedupes duplicate image asset references without deduping non-image references", () => {
        const refs: StudioAssetRef[] = [
            { assetId: "image-a", kind: "image", role: "candidate", metadata: { kept: true } },
            { assetId: "image-a", kind: "image", role: "selected", metadata: { dropped: true } },
            { assetId: "text-a", kind: "text", role: "reference", note: "first" },
            { assetId: "text-a", kind: "text", role: "reference", note: "second" },
        ];

        expect(normalizeStudioImageVariants(refs)).toEqual([
            { assetId: "image-a", kind: "image", role: "selected", metadata: { kept: true } },
            { assetId: "text-a", kind: "text", role: "reference", note: "first" },
            { assetId: "text-a", kind: "text", role: "reference", note: "second" },
        ]);
    });

    it("selects the promoted image and demotes the previous selected image", () => {
        expect(
            selectStudioImageVariant(
                [
                    { assetId: "image-old", kind: "image", role: "selected" },
                    { assetId: "image-next", kind: "image", role: "candidate" },
                ],
                "image-next",
            ),
        ).toEqual([
            { assetId: "image-old", kind: "image", role: "candidate" },
            { assetId: "image-next", kind: "image", role: "selected" },
        ]);
    });

    it("selects only the first generated image when no selected image exists", () => {
        expect(
            appendStudioImageVariants(
                [{ assetId: "text-a", kind: "text", role: "reference" }],
                [
                    { assetId: "image-one", kind: "image" },
                    { assetId: "image-two", kind: "image" },
                ],
            ),
        ).toEqual([
            { assetId: "text-a", kind: "text", role: "reference" },
            { assetId: "image-one", kind: "image", role: "selected" },
            { assetId: "image-two", kind: "image", role: "candidate" },
        ]);
    });

    it("appends generated images as candidates when a selected image already exists", () => {
        expect(
            appendStudioImageVariants(
                [{ assetId: "image-selected", kind: "image", role: "selected" }],
                [
                    { assetId: "image-one", kind: "image" },
                    { assetId: "image-two", kind: "image" },
                ],
            ),
        ).toEqual([
            { assetId: "image-selected", kind: "image", role: "selected" },
            { assetId: "image-one", kind: "image", role: "candidate" },
            { assetId: "image-two", kind: "image", role: "candidate" },
        ]);
    });

    it("upserts a library image as candidate or selected without duplicating it", () => {
        const refs: StudioAssetRef[] = [
            { assetId: "image-old", kind: "image", role: "selected" },
            { assetId: "image-library", kind: "image", role: "candidate", metadata: { source: "asset-library" } },
        ];

        expect(upsertStudioImageVariant(refs, { assetId: "image-library", role: "selected" })).toEqual([
            { assetId: "image-old", kind: "image", role: "candidate" },
            { assetId: "image-library", kind: "image", role: "selected", metadata: { source: "asset-library" } },
        ]);
    });

    it("removes only a candidate relationship", () => {
        const refs: StudioAssetRef[] = [
            { assetId: "image-selected", kind: "image", role: "selected" },
            { assetId: "image-remove", kind: "image", role: "candidate" },
            { assetId: "image-remove", kind: "video", role: "candidate" },
        ];

        expect(removeStudioImageCandidateVariant(refs, "image-remove")).toEqual([
            { assetId: "image-selected", kind: "image", role: "selected" },
            { assetId: "image-remove", kind: "video", role: "candidate" },
        ]);
    });
});
