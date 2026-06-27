import { describe, expect, it } from "vitest";

import type { Asset } from "@/stores/use-asset-store";

import { queryLocalAssetLibrary, toInsertAssetPayload } from "./local-asset-library";

const assets: Asset[] = [
    {
        id: "text-1",
        kind: "text",
        title: "品牌标题",
        coverUrl: "",
        tags: ["文案", "品牌"],
        source: "本地",
        note: "首页主标题",
        createdAt: "2026-06-27T00:00:00.000Z",
        updatedAt: "2026-06-27T00:00:00.000Z",
        data: { content: "一句品牌文案" },
    },
    {
        id: "image-1",
        kind: "image",
        title: "主视觉",
        coverUrl: "https://example.com/cover.png",
        tags: ["海报"],
        source: "本地",
        note: "KV",
        createdAt: "2026-06-27T00:00:00.000Z",
        updatedAt: "2026-06-27T00:00:00.000Z",
        data: {
            dataUrl: "https://example.com/image.png",
            storageKey: "image-key",
            width: 1280,
            height: 720,
            bytes: 1024,
            mimeType: "image/png",
        },
    },
    {
        id: "video-1",
        kind: "video",
        title: "产品演示",
        coverUrl: "https://example.com/video-cover.png",
        tags: ["视频", "演示"],
        source: "本地",
        note: "产品功能介绍",
        createdAt: "2026-06-27T00:00:00.000Z",
        updatedAt: "2026-06-27T00:00:00.000Z",
        data: {
            url: "https://example.com/video.mp4",
            storageKey: "video-key",
            width: 1920,
            height: 1080,
            bytes: 2048,
            mimeType: "video/mp4",
        },
    },
];

describe("local asset library", () => {
    it("filters local assets by keyword, kind and tags, and keeps video items", () => {
        expect(queryLocalAssetLibrary(assets, { keyword: "品牌", page: 1, pageSize: 12 })).toMatchObject({
            total: 1,
            items: [{ id: "text-1" }],
        });

        expect(queryLocalAssetLibrary(assets, { kind: "video", page: 1, pageSize: 12 })).toMatchObject({
            total: 1,
            items: [{ id: "video-1" }],
        });

        expect(queryLocalAssetLibrary(assets, { tags: ["海报"], page: 1, pageSize: 12 })).toMatchObject({
            total: 1,
            items: [{ id: "image-1" }],
        });
    });

    it("returns paged items and available tags from the current local result set", () => {
        const page = queryLocalAssetLibrary(assets, { page: 2, pageSize: 1 });

        expect(page.total).toBe(3);
        expect(page.items).toMatchObject([{ id: "image-1" }]);
        expect(page.tags).toEqual(["海报", "品牌", "视频", "文案", "演示"]);
    });

    it("maps local assets to insert payloads for canvas consumers", () => {
        expect(toInsertAssetPayload(assets[0])).toEqual({
            kind: "text",
            content: "一句品牌文案",
            title: "品牌标题",
        });

        expect(toInsertAssetPayload(assets[1])).toEqual({
            kind: "image",
            dataUrl: "https://example.com/image.png",
            storageKey: "image-key",
            title: "主视觉",
        });

        expect(toInsertAssetPayload(assets[2])).toEqual({
            kind: "video",
            url: "https://example.com/video.mp4",
            storageKey: "video-key",
            title: "产品演示",
            width: 1920,
            height: 1080,
        });
    });
});
