import { describe, expect, it, vi } from "vitest";

import { createZip, readZip } from "@/lib/zip";
import type { Asset } from "@/stores/use-asset-store";

const mocks = vi.hoisted(() => ({
    readBlob: vi.fn(),
    writeBlob: vi.fn(),
    saveAs: vi.fn(),
}));

vi.mock("@/services/asset-media-storage", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/asset-media-storage")>();
    return {
        ...actual,
        assetMediaStorage: {
            readBlob: mocks.readBlob,
            writeBlob: mocks.writeBlob,
        },
    };
});

vi.mock("file-saver", () => ({ saveAs: mocks.saveAs }));

import { exportAssets, readAssetPackage } from "./asset-transfer";

function asset(overrides: Partial<Asset> = {}): Asset {
    return {
        id: "asset-image",
        kind: "image",
        title: "图片",
        coverUrl: "blob:image",
        tags: [],
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        data: { dataUrl: "blob:image", storageKey: "image:asset", width: 100, height: 80, bytes: 5, mimeType: "image/png" },
        ...overrides,
    } as Asset;
}

describe("asset transfer", () => {
    it("exports local media blobs through asset media storage", async () => {
        const blob = new Blob(["image"], { type: "image/png" });
        mocks.readBlob.mockResolvedValueOnce(blob);

        await exportAssets([asset()]);

        expect(mocks.readBlob).toHaveBeenCalledWith("image:asset");
        const savedZip = mocks.saveAs.mock.calls[0][0] as Blob;
        const zip = await readZip(savedZip);
        const manifest = JSON.parse(await zip.get("assets.json")!.text());
        expect(manifest.files).toEqual([{ storageKey: "image:asset", path: "files/image_asset.png", mimeType: "image/png", bytes: blob.size }]);
        await expect(zip.get("files/image_asset.png")!.text()).resolves.toBe("image");
    });

    it("imports packaged media blobs through asset media storage", async () => {
        const packageFile = await createZip([
            {
                name: "assets.json",
                data: JSON.stringify({
                    app: "infinite-canvas",
                    version: 1,
                    exportedAt: "2026-07-01T00:00:00.000Z",
                    assets: [asset()],
                    files: [{ storageKey: "image:asset", path: "files/image_asset.png", mimeType: "image/png", bytes: 5 }],
                }),
            },
            { name: "files/image_asset.png", data: new Blob(["image"], { type: "image/png" }) },
        ]);

        const assets = await readAssetPackage(packageFile as File);

        expect(assets).toHaveLength(1);
        expect(mocks.writeBlob).toHaveBeenCalledWith("image:asset", expect.any(Blob));
        await expect((mocks.writeBlob.mock.calls[0][1] as Blob).text()).resolves.toBe("image");
    });
});
