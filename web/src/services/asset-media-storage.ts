"use client";

import { deleteStoredMedia, getMediaBlob, listStoredMediaKeys, resolveMediaUrl, setMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { deleteStoredImages, getImageBlob, listStoredImageKeys, resolveImageUrl, setImageBlob, uploadImage, type UploadedImage } from "@/services/image-storage";

export type AssetMediaStorageKind = "image" | "video" | "audio" | "file" | "video-reference" | "audio-reference";
export type AssetMediaFileStorageKind = Exclude<AssetMediaStorageKind, "image">;
export type UploadedAssetImage = UploadedImage;
export type UploadedAssetFile = UploadedFile;
export type UploadedAssetMedia = UploadedImage | UploadedFile;

type AssetMediaUploadInput = string | Blob;

export type AssetMediaStorageEngine<TUpload extends UploadedAssetMedia = UploadedAssetMedia> = {
    readBlob: (storageKey: string) => Promise<Blob | null>;
    writeBlob: (storageKey: string, blob: Blob) => Promise<string>;
    resolveUrl: (storageKey: string, fallback?: string) => Promise<string>;
    upload?: (input: AssetMediaUploadInput, prefix?: string) => Promise<TUpload>;
    listStorageKeys?: () => Promise<string[]>;
    deleteStorageKeys?: (keys: Iterable<string>) => Promise<void>;
};

export type AssetMediaStorageAdapter = {
    image: AssetMediaStorageEngine<UploadedAssetImage>;
    media: AssetMediaStorageEngine<UploadedAssetFile>;
};

export type AssetMediaStorage = {
    readBlob: (storageKey: string) => Promise<Blob | null>;
    writeBlob: (storageKey: string, blob: Blob) => Promise<string>;
    resolveUrl: (storageKey?: string, fallback?: string) => Promise<string>;
    upload: {
        (input: AssetMediaUploadInput, kind: "image"): Promise<UploadedAssetImage>;
        (input: AssetMediaUploadInput, kind?: AssetMediaFileStorageKind): Promise<UploadedAssetFile>;
        (input: AssetMediaUploadInput, kind?: AssetMediaStorageKind): Promise<UploadedAssetMedia>;
    };
    listStorageKeys: () => Promise<string[]>;
    deleteStorageKeys: (keys: Iterable<string>) => Promise<void>;
};

const STORAGE_KEY_PATTERN = /^(image|video|audio|file|video-reference|audio-reference):.+$/;
const MIME_EXTENSION_RULES = [
    ["png", "png"],
    ["jpeg", "jpg"],
    ["webp", "webp"],
    ["gif", "gif"],
    ["mp4", "mp4"],
    ["webm", "webm"],
    ["wav", "wav"],
    ["mpeg", "mp3"],
    ["mp3", "mp3"],
] as const;

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

export function uploadAssetImage(input: AssetMediaUploadInput, storage: AssetMediaStorage = assetMediaStorage): Promise<UploadedAssetImage> {
    return storage.upload(input, "image");
}

export function createAssetMediaStorage(adapter: AssetMediaStorageAdapter): AssetMediaStorage {
    function upload(input: AssetMediaUploadInput, kind: "image"): Promise<UploadedAssetImage>;
    function upload(input: AssetMediaUploadInput, kind?: AssetMediaFileStorageKind): Promise<UploadedAssetFile>;
    function upload(input: AssetMediaUploadInput, kind?: AssetMediaStorageKind): Promise<UploadedAssetMedia>;
    function upload(input: AssetMediaUploadInput, kind: AssetMediaStorageKind = "file"): Promise<UploadedAssetMedia> {
        const engine = engineForStorageKind(kind, adapter);
        if (!engine.upload) throw new Error("当前媒体存储不支持上传");
        return engine.upload(input, kind);
    }

    return {
        readBlob: (storageKey: string) => engineForStorageKey(storageKey, adapter).readBlob(storageKey),
        writeBlob: (storageKey: string, blob: Blob) => engineForStorageKey(storageKey, adapter).writeBlob(storageKey, blob),
        resolveUrl: (storageKey?: string, fallback = "") => {
            const parsed = storageKey ? parseAssetMediaStorageKey(storageKey) : null;
            if (!parsed) return Promise.resolve(fallback);
            return engineForStorageKind(parsed.kind, adapter).resolveUrl(parsed.storageKey, fallback);
        },
        upload,
        listStorageKeys: async (): Promise<string[]> => {
            const [imageKeys, mediaKeys] = await Promise.all([adapter.image.listStorageKeys?.() ?? [], adapter.media.listStorageKeys?.() ?? []]);
            return [...imageKeys, ...mediaKeys];
        },
        deleteStorageKeys: async (keys: Iterable<string>) => {
            const { imageKeys, mediaKeys } = groupStorageKeysByEngine(keys);
            const deleteTasks: Array<Promise<void>> = [];
            if (imageKeys.length && adapter.image.deleteStorageKeys) deleteTasks.push(adapter.image.deleteStorageKeys(imageKeys));
            if (mediaKeys.length && adapter.media.deleteStorageKeys) deleteTasks.push(adapter.media.deleteStorageKeys(mediaKeys));
            await Promise.all(deleteTasks);
        },
    };
}

export function isAssetMediaStorageKey(value: string): boolean {
    return STORAGE_KEY_PATTERN.test(value);
}

export function parseAssetMediaStorageKey(storageKey: string): { kind: AssetMediaStorageKind; storageKey: string } | null {
    const match = STORAGE_KEY_PATTERN.exec(storageKey);
    if (!match) return null;
    return { kind: match[1] as AssetMediaStorageKind, storageKey };
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
    const mimeExtension = extensionFromMimeType(mimeType);
    if (mimeExtension) return mimeExtension;

    const parsed = parseAssetMediaStorageKey(storageKey);
    switch (parsed?.kind) {
        case "image":
            return "png";
        case "video":
        case "video-reference":
            return "mp4";
        case "audio":
        case "audio-reference":
            return "mp3";
    }
    return "bin";
}

function extensionFromMimeType(mimeType: string | undefined) {
    const type = mimeType || "";
    return MIME_EXTENSION_RULES.find(([token]) => type.includes(token))?.[1];
}

function groupStorageKeysByEngine(keys: Iterable<string>) {
    const imageKeys: string[] = [];
    const mediaKeys: string[] = [];

    for (const key of new Set(keys)) {
        const parsed = parseAssetMediaStorageKey(key);
        if (!parsed) continue;
        if (parsed.kind === "image") imageKeys.push(key);
        else mediaKeys.push(key);
    }

    return { imageKeys, mediaKeys };
}

function engineForStorageKey(storageKey: string, adapter: AssetMediaStorageAdapter) {
    const parsed = parseAssetMediaStorageKey(storageKey);
    if (!parsed) throw new Error(`未知本地媒体 storageKey: ${storageKey}`);
    return engineForStorageKind(parsed.kind, adapter);
}

function engineForStorageKind(kind: AssetMediaStorageKind, adapter: AssetMediaStorageAdapter) {
    return kind === "image" ? adapter.image : adapter.media;
}
