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

type InsertAssetPayload = { kind: "text"; content: string; title: string } | { kind: "image"; dataUrl: string; title: string; storageKey?: string } | { kind: "video"; url: string; title: string; storageKey?: string; width?: number; height?: number };

const libraryKinds: AssetKind[] = ["text", "image", "video"];

export function queryLocalAssetLibrary(assets: Asset[], query: LocalAssetLibraryQuery = {}): LocalAssetLibraryResult {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, query.pageSize ?? Math.max(assets.length, 1));
    const validAssets = assets.filter((asset) => libraryKinds.includes(asset.kind));
    const normalizedKind = query.kind && query.kind !== "all" ? query.kind : "";
    const normalizedKeyword = query.keyword?.trim().toLowerCase() || "";
    const normalizedTags = query.tags?.filter(Boolean) || [];

    const baseFiltered = validAssets
        .filter((asset) => !normalizedKind || asset.kind === normalizedKind)
        .filter((asset) => !normalizedKeyword || assetSearchText(asset).includes(normalizedKeyword));

    const filtered = baseFiltered.filter((asset) => normalizedTags.length === 0 || normalizedTags.every((tag) => asset.tags.includes(tag)));

    return {
        items: filtered.slice((page - 1) * pageSize, page * pageSize),
        total: filtered.length,
        tags: Array.from(new Set(baseFiltered.flatMap((asset) => asset.tags))).sort((left, right) => left.localeCompare(right, "zh-CN")),
    };
}

export function toInsertAssetPayload(asset: Asset): InsertAssetPayload {
    if (asset.kind === "text") {
        return { kind: "text", content: asset.data.content, title: asset.title };
    }
    if (asset.kind === "video") {
        return {
            kind: "video",
            url: asset.data.url,
            storageKey: asset.data.storageKey,
            title: asset.title,
            width: asset.data.width,
            height: asset.data.height,
        };
    }
    return {
        kind: "image",
        dataUrl: asset.data.dataUrl,
        storageKey: asset.data.storageKey,
        title: asset.title,
    };
}

export function getAssetCoverUrl(asset: Asset) {
    if (asset.coverUrl) return asset.coverUrl;
    if (asset.kind === "image") return asset.data.dataUrl;
    if (asset.kind === "video") return asset.data.url;
    return "";
}

function assetSearchText(asset: Asset) {
    return [asset.title, asset.source || "", asset.note || "", asset.tags.join(" "), asset.kind === "text" ? asset.data.content : asset.data.mimeType].join(" ").toLowerCase();
}
