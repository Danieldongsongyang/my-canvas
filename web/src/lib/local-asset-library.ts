import { formatBytes } from "@/lib/image-utils";
import { createLocalAssetReference, type AssetRef } from "@/services/asset-references";
import type { Asset, AssetKind } from "@/stores/use-asset-store";

type LocalAssetLibraryQuery = {
    keyword?: string;
    kind?: AssetKind | "all" | "";
    tags?: string[];
    page?: number;
    pageSize?: number;
};

type LocalAssetLibraryResult = {
    items: Asset[];
    tags: string[];
    total: number;
};

export type InsertAssetPayload =
    | { kind: "text"; content: string; title: string; assetRef: AssetRef }
    | { kind: "image"; dataUrl: string; title: string; storageKey?: string; assetRef: AssetRef }
    | { kind: "video"; url: string; title: string; storageKey?: string; width?: number; height?: number; assetRef: AssetRef };

const libraryKinds: AssetKind[] = ["text", "image", "video"];

export function queryLocalAssetLibrary(assets: Asset[], query: LocalAssetLibraryQuery = {}): LocalAssetLibraryResult {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, query.pageSize ?? Math.max(assets.length, 1));
    const validAssets = assets.filter((asset) => libraryKinds.includes(asset.kind));
    const normalizedKind = query.kind && query.kind !== "all" ? query.kind : "";
    const normalizedKeyword = query.keyword?.trim().toLowerCase() || "";
    const normalizedTags = query.tags?.filter(Boolean) || [];

    const baseFiltered = validAssets.filter((asset) => matchesKind(asset, normalizedKind) && matchesKeyword(asset, normalizedKeyword));

    const filtered = baseFiltered.filter((asset) => matchesTags(asset, normalizedTags));

    return {
        items: filtered.slice((page - 1) * pageSize, page * pageSize),
        total: filtered.length,
        tags: Array.from(new Set(baseFiltered.flatMap((asset) => asset.tags))).sort((left, right) => left.localeCompare(right, "zh-CN")),
    };
}

export function toInsertAssetPayload(asset: Asset): InsertAssetPayload {
    const assetRef = createLocalAssetReference(asset);
    if (asset.kind === "text") {
        return { kind: "text", content: asset.data.content, title: asset.title, assetRef };
    }
    if (asset.kind === "video") {
        return {
            kind: "video",
            url: asset.data.url,
            storageKey: asset.data.storageKey,
            title: asset.title,
            width: asset.data.width,
            height: asset.data.height,
            assetRef,
        };
    }
    return {
        kind: "image",
        dataUrl: asset.data.dataUrl,
        storageKey: asset.data.storageKey,
        title: asset.title,
        assetRef,
    };
}

export function getAssetCoverUrl(asset: Asset) {
    if (asset.coverUrl) return asset.coverUrl;
    if (asset.kind === "image") return asset.data.dataUrl;
    if (asset.kind === "video") return asset.data.url;
    return "";
}

export function getAssetKindLabel(kind: AssetKind) {
    switch (kind) {
        case "image":
            return "图片";
        case "video":
            return "视频";
        case "text":
            return "文本";
    }
}

export function getAssetFallbackText(asset: Asset) {
    if (asset.kind === "text") return asset.data.content;
    return "暂无封面";
}

export function getAssetCardSummary(asset: Asset) {
    if (asset.kind === "text") return asset.data.content;
    return `${asset.data.width}x${asset.data.height} · ${formatBytes(asset.data.bytes)}`;
}

export function getAssetDetailSummary(asset: Asset) {
    if (asset.kind === "text") return asset.data.content;
    return `${asset.data.width}x${asset.data.height} · ${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
}

function assetSearchText(asset: Asset) {
    return [asset.title, asset.source || "", asset.note || "", asset.tags.join(" "), asset.kind === "text" ? asset.data.content : asset.data.mimeType].join(" ").toLowerCase();
}

function matchesKind(asset: Asset, kind: AssetKind | "") {
    return !kind || asset.kind === kind;
}

function matchesKeyword(asset: Asset, keyword: string) {
    return !keyword || assetSearchText(asset).includes(keyword);
}

function matchesTags(asset: Asset, tags: string[]) {
    return tags.length === 0 || tags.every((tag) => asset.tags.includes(tag));
}
