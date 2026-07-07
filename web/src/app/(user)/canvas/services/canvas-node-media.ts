import { deleteStoredImages, listStoredImageKeys, resolveImageUrl, uploadImage, type UploadedImage } from "@/services/image-storage";
import { deleteStoredMedia, listStoredMediaKeys, resolveMediaUrl, uploadMediaFile, type UploadedFile } from "@/services/file-storage";

import { CanvasNodeType, type CanvasAssistantMessage, type CanvasAssistantSession, type CanvasNodeData, type CanvasNodeMetadata } from "../types";

type CanvasImageStorageAdapter = {
    upload: (input: string | Blob) => Promise<UploadedImage>;
    resolveUrl: (storageKey: string, fallback?: string) => Promise<string>;
    listStorageKeys: () => Promise<string[]>;
    deleteStorageKeys: (keys: Iterable<string>) => Promise<void>;
};

type CanvasFileStorageAdapter = {
    upload: (input: string | Blob, prefix?: string) => Promise<UploadedFile>;
    resolveUrl: (storageKey: string, fallback?: string) => Promise<string>;
    listStorageKeys: () => Promise<string[]>;
    deleteStorageKeys: (keys: Iterable<string>) => Promise<void>;
};

type CanvasStorageCleanupAdapter = {
    listStorageKeys: () => Promise<string[]>;
    deleteStorageKeys: (keys: Iterable<string>) => Promise<void>;
};

export type CanvasNodeMediaAdapter = {
    image: CanvasImageStorageAdapter;
    media: CanvasFileStorageAdapter;
};

export type CanvasImageMediaAdapter = CanvasNodeMediaAdapter;

export type CanvasNodeMediaCleanupInput = {
    projects?: unknown[];
    assets?: unknown[];
    history?: unknown;
    lastHistory?: unknown;
    extra?: unknown;
};

export type CanvasImageMediaCleanupInput = CanvasNodeMediaCleanupInput;

export type CanvasImageMediaInput = {
    dataUrl: string;
    storageKey?: string;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
};

type HydratableAssistantImageMedia = {
    dataUrl?: string;
    storageKey?: string;
};

const IMAGE_STORAGE_KEY_PREFIX = "image:";
const CANVAS_NODE_MEDIA_STORAGE_KEY_PREFIXES = [IMAGE_STORAGE_KEY_PREFIX, "video:", "audio:", "file:", "video-reference:", "audio-reference:"];

const defaultCanvasNodeMediaAdapter: CanvasNodeMediaAdapter = {
    image: {
        upload: uploadImage,
        resolveUrl: resolveImageUrl,
        listStorageKeys: listStoredImageKeys,
        deleteStorageKeys: deleteStoredImages,
    },
    media: {
        upload: uploadMediaFile,
        resolveUrl: resolveMediaUrl,
        listStorageKeys: listStoredMediaKeys,
        deleteStorageKeys: deleteStoredMedia,
    },
};

export async function hydrateCanvasNodeMedia(node: CanvasNodeData, adapter: CanvasNodeMediaAdapter = defaultCanvasNodeMediaAdapter): Promise<CanvasNodeData> {
    const metadata = await hydrateCanvasNodeMetadata(node, adapter);
    return metadata === node.metadata ? node : { ...node, metadata };
}

export async function hydrateCanvasNodeImageMedia(node: CanvasNodeData, adapter: CanvasNodeMediaAdapter = defaultCanvasNodeMediaAdapter): Promise<CanvasNodeData> {
    return hydrateCanvasNodeMedia(node, adapter);
}

export async function hydrateCanvasAssistantImageMedia(sessions: CanvasAssistantSession[], adapter: CanvasNodeMediaAdapter = defaultCanvasNodeMediaAdapter): Promise<CanvasAssistantSession[]> {
    return Promise.all(
        sessions.map(async (session) => ({
            ...session,
            messages: await Promise.all(session.messages.map((message) => hydrateAssistantMessageImageMedia(message, adapter))),
        })),
    );
}

export async function materializeCanvasImageMedia(input: CanvasImageMediaInput, adapter: CanvasNodeMediaAdapter = defaultCanvasNodeMediaAdapter): Promise<UploadedImage> {
    if (!input.storageKey) return adapter.image.upload(input.dataUrl);
    const url = await adapter.image.resolveUrl(input.storageKey, input.dataUrl);
    return {
        url,
        storageKey: input.storageKey,
        width: input.width || 0,
        height: input.height || 0,
        bytes: input.bytes || 0,
        mimeType: input.mimeType || "image/png",
    };
}

export async function cleanupUnusedCanvasNodeMedia(input: CanvasNodeMediaCleanupInput, adapter: CanvasNodeMediaAdapter = defaultCanvasNodeMediaAdapter): Promise<void> {
    const usedKeys = collectCanvasNodeMediaStorageKeys(input);
    const unusedImageKeys = await listUnusedStorageKeys(adapter.image, usedKeys);
    const unusedMediaKeys = await listUnusedStorageKeys(adapter.media, usedKeys);
    await Promise.all([deleteStorageKeys(adapter.image, unusedImageKeys), deleteStorageKeys(adapter.media, unusedMediaKeys)]);
}

export async function cleanupUnusedCanvasImageMedia(input: CanvasImageMediaCleanupInput, adapter: CanvasNodeMediaAdapter = defaultCanvasNodeMediaAdapter): Promise<void> {
    await cleanupUnusedCanvasNodeMedia(input, adapter);
}

export function collectCanvasImageStorageKeys(value: unknown, keys = new Set<string>()): Set<string> {
    return collectCanvasStorageKeys(value, keys, isCanvasImageStorageKey);
}

export function collectCanvasNodeMediaStorageKeys(value: unknown, keys = new Set<string>()): Set<string> {
    return collectCanvasStorageKeys(value, keys, isCanvasNodeMediaStorageKey);
}

async function hydrateAssistantMessageImageMedia(message: CanvasAssistantMessage, adapter: CanvasNodeMediaAdapter): Promise<CanvasAssistantMessage> {
    return {
        ...message,
        references: await Promise.all((message.references || []).map((reference) => hydrateAssistantImageMediaItem(reference, adapter))),
        images: await Promise.all((message.images || []).map((image) => hydrateAssistantImageMediaItem(image, adapter))),
    };
}

async function hydrateAssistantImageMediaItem<T extends HydratableAssistantImageMedia>(item: T, adapter: CanvasNodeMediaAdapter): Promise<T> {
    if (item.storageKey) return { ...item, dataUrl: await adapter.image.resolveUrl(item.storageKey, item.dataUrl) };
    if (!item.dataUrl?.startsWith("data:image/")) return item;

    const image = await adapter.image.upload(item.dataUrl);
    return { ...item, dataUrl: image.url, storageKey: image.storageKey };
}

async function hydrateCanvasNodeMetadata(node: CanvasNodeData, adapter: CanvasNodeMediaAdapter): Promise<CanvasNodeMetadata | undefined> {
    if (!node.metadata?.content) return node.metadata;

    switch (node.type) {
        case CanvasNodeType.Image:
            return hydrateImageMetadata(node.metadata, adapter.image);
        case CanvasNodeType.Video:
        case CanvasNodeType.Audio:
            return hydrateFileMetadata(node.type, node.metadata, adapter.media);
        default:
            return node.metadata;
    }
}

async function hydrateImageMetadata(metadata: CanvasNodeMetadata, adapter: CanvasImageStorageAdapter): Promise<CanvasNodeMetadata> {
    if (metadata.storageKey) return { ...metadata, content: await adapter.resolveUrl(metadata.storageKey, metadata.content) };
    if (!metadata.content?.startsWith("data:image/")) return metadata;
    return buildImageMetadata(await adapter.upload(metadata.content), metadata);
}

async function hydrateFileMetadata(type: CanvasNodeType.Video | CanvasNodeType.Audio, metadata: CanvasNodeMetadata, adapter: CanvasFileStorageAdapter): Promise<CanvasNodeMetadata> {
    if (metadata.storageKey) return { ...metadata, content: await adapter.resolveUrl(metadata.storageKey, metadata.content) };
    const prefix = type === CanvasNodeType.Video ? "video" : "audio";
    if (!metadata.content?.startsWith(`data:${prefix}/`)) return metadata;
    return buildFileMetadata(await adapter.upload(metadata.content, prefix), metadata);
}

function buildImageMetadata(image: UploadedImage, metadata: CanvasNodeMetadata): CanvasNodeMetadata {
    return {
        ...metadata,
        content: image.url,
        storageKey: image.storageKey,
        status: "success",
        naturalWidth: image.width,
        naturalHeight: image.height,
        bytes: image.bytes,
        mimeType: image.mimeType,
    };
}

function buildFileMetadata(file: UploadedFile, metadata: CanvasNodeMetadata): CanvasNodeMetadata {
    return {
        ...metadata,
        content: file.url,
        storageKey: file.storageKey,
        status: "success",
        naturalWidth: file.width,
        naturalHeight: file.height,
        bytes: file.bytes,
        mimeType: file.mimeType,
        durationMs: file.durationMs,
    };
}

async function listUnusedStorageKeys(adapter: CanvasStorageCleanupAdapter, usedKeys: Set<string>) {
    return (await adapter.listStorageKeys()).filter((key) => !usedKeys.has(key));
}

async function deleteStorageKeys(adapter: CanvasStorageCleanupAdapter, keys: string[]) {
    if (keys.length) await adapter.deleteStorageKeys(keys);
}

function collectCanvasStorageKeys(value: unknown, keys: Set<string>, isStorageKey: (value: string) => boolean): Set<string> {
    if (typeof value === "string") {
        if (isStorageKey(value)) keys.add(value);
        return keys;
    }
    if (!value || typeof value !== "object") return keys;

    for (const child of Object.values(value)) {
        collectCanvasStorageKeys(child, keys, isStorageKey);
    }

    return keys;
}

function isCanvasImageStorageKey(storageKey: string) {
    return storageKey.startsWith(IMAGE_STORAGE_KEY_PREFIX);
}

function isCanvasNodeMediaStorageKey(storageKey: string) {
    return CANVAS_NODE_MEDIA_STORAGE_KEY_PREFIXES.some((prefix) => storageKey.startsWith(prefix));
}
