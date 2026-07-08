"use client";

import { deleteStoredMedia, getMediaBlob, listStoredMediaKeys, resolveMediaUrl, setMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { deleteStoredImages, getImageBlob, listStoredImageKeys, resolveImageUrl, setImageBlob, uploadImage, type UploadedImage } from "@/services/image-storage";

export type AssetMediaStorageKind = "image" | "video" | "audio" | "file" | "video-reference" | "audio-reference";
export type UploadedAssetImage = UploadedImage;
export type UploadedAssetFile = UploadedFile;
export type UploadedAssetMedia = UploadedImage | UploadedFile;

export type AssetMediaStorageEngine = {
    readBlob: (storageKey: string) => Promise<Blob | null>;
    writeBlob: (storageKey: string, blob: Blob) => Promise<string>;
    resolveUrl: (storageKey: string, fallback?: string) => Promise<string>;
    upload?: (input: string | Blob, prefix?: string) => Promise<UploadedAssetMedia>;
    listStorageKeys?: () => Promise<string[]>;
    deleteStorageKeys?: (keys: Iterable<string>) => Promise<void>;
};

export type AssetMediaStorageAdapter = {
    image: AssetMediaStorageEngine;
    media: AssetMediaStorageEngine;
};

export type AssetMediaStorage = ReturnType<typeof createAssetMediaStorage>;

const STORAGE_KEY_PATTERN = /^(image|video|audio|file|video-reference|audio-reference):.+$/;

const defaultAssetMediaStorageAdapter: AssetMediaStorageAdapter = {
    image: {
        readBlob: getImageBlob,
        writeBlob: setImageBlob,
        resolveUrl: resolveImageUrl,
        upload: uploadImage,
        listStorageKeys: listStoredImageKeys,
        deleteStorageKeys: deleteStoredImages,
    },
    media: {
        readBlob: getMediaBlob,
        writeBlob: setMediaBlob,
        resolveUrl: resolveMediaUrl,
        upload: uploadMediaFile,
        listStorageKeys: listStoredMediaKeys,
        deleteStorageKeys: deleteStoredMedia,
    },
};

export const assetMediaStorage = createAssetMediaStorage(defaultAssetMediaStorageAdapter);

export function uploadAssetImage(input: string | Blob, storage: AssetMediaStorage = assetMediaStorage): Promise<UploadedAssetImage> {
    return storage.upload(input, "image") as Promise<UploadedAssetImage>;
}

export function createAssetMediaStorage(adapter: AssetMediaStorageAdapter) {
    return {
        readBlob: (storageKey: string) => engineForStorageKey(storageKey, adapter).readBlob(storageKey),
        writeBlob: (storageKey: string, blob: Blob) => engineForStorageKey(storageKey, adapter).writeBlob(storageKey, blob),
        resolveUrl: (storageKey?: string, fallback = "") => {
            if (!storageKey || !isAssetMediaStorageKey(storageKey)) return Promise.resolve(fallback);
            return engineForStorageKey(storageKey, adapter).resolveUrl(storageKey, fallback);
        },
        upload: (input: string | Blob, kind: AssetMediaStorageKind = "file") => {
            const engine = kind === "image" ? adapter.image : adapter.media;
            if (!engine.upload) throw new Error("当前媒体存储不支持上传");
            return engine.upload(input, kind);
        },
        listStorageKeys: async () => {
            const imageKeys = (await adapter.image.listStorageKeys?.()) || [];
            const mediaKeys = (await adapter.media.listStorageKeys?.()) || [];
            return [...imageKeys, ...mediaKeys];
        },
        deleteStorageKeys: async (keys: Iterable<string>) => {
            const imageKeys: string[] = [];
            const mediaKeys: string[] = [];
            for (const key of new Set(keys)) {
                if (!isAssetMediaStorageKey(key)) continue;
                if (parseAssetMediaStorageKey(key)?.kind === "image") imageKeys.push(key);
                else mediaKeys.push(key);
            }
            await Promise.all([imageKeys.length ? adapter.image.deleteStorageKeys?.(imageKeys) : undefined, mediaKeys.length ? adapter.media.deleteStorageKeys?.(mediaKeys) : undefined]);
        },
    };
}

export function isAssetMediaStorageKey(value: string): boolean {
    return STORAGE_KEY_PATTERN.test(value);
}

export function parseAssetMediaStorageKey(storageKey: string): { kind: AssetMediaStorageKind; storageKey: string } | null {
    if (!isAssetMediaStorageKey(storageKey)) return null;
    return { kind: storageKey.slice(0, storageKey.indexOf(":")) as AssetMediaStorageKind, storageKey };
}

export function collectAssetMediaStorageKeys(value: unknown, keys = new Set<string>()): Set<string> {
    if (typeof value === "string") {
        if (isAssetMediaStorageKey(value)) keys.add(value);
        return keys;
    }
    if (!value || typeof value !== "object") return keys;

    for (const child of Object.values(value)) {
        collectAssetMediaStorageKeys(child, keys);
    }

    return keys;
}

export function inferAssetMediaFileExtension(mimeType: string | undefined, storageKey: string): string {
    const type = mimeType || "";
    if (type.includes("png")) return "png";
    if (type.includes("jpeg")) return "jpg";
    if (type.includes("webp")) return "webp";
    if (type.includes("gif")) return "gif";
    if (type.includes("mp4")) return "mp4";
    if (type.includes("webm")) return "webm";
    if (type.includes("wav")) return "wav";
    if (type.includes("mpeg") || type.includes("mp3")) return "mp3";

    const parsed = parseAssetMediaStorageKey(storageKey);
    if (parsed?.kind === "image") return "png";
    if (parsed?.kind === "video" || parsed?.kind === "video-reference") return "mp4";
    if (parsed?.kind === "audio" || parsed?.kind === "audio-reference") return "mp3";
    return "bin";
}

function engineForStorageKey(storageKey: string, adapter: AssetMediaStorageAdapter) {
    const parsed = parseAssetMediaStorageKey(storageKey);
    if (!parsed) throw new Error(`未知本地媒体 storageKey: ${storageKey}`);
    return parsed.kind === "image" ? adapter.image : adapter.media;
}
