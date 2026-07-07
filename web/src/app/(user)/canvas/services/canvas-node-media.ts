import { deleteStoredImages, listStoredImageKeys, resolveImageUrl, uploadImage, type UploadedImage } from "@/services/image-storage";

import { CanvasNodeType, type CanvasAssistantSession, type CanvasNodeData, type CanvasNodeMetadata } from "../types";

export type CanvasImageMediaAdapter = {
    upload: (input: string | Blob) => Promise<UploadedImage>;
    resolveUrl: (storageKey: string, fallback?: string) => Promise<string>;
    listStorageKeys: () => Promise<string[]>;
    deleteStorageKeys: (keys: Iterable<string>) => Promise<void>;
};

export type CanvasImageMediaCleanupInput = {
    projects?: unknown[];
    assets?: unknown[];
    history?: unknown;
    lastHistory?: unknown;
    extra?: unknown;
};

export type CanvasImageMediaInput = {
    dataUrl: string;
    storageKey?: string;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
};

const defaultCanvasImageMediaAdapter: CanvasImageMediaAdapter = {
    upload: uploadImage,
    resolveUrl: resolveImageUrl,
    listStorageKeys: listStoredImageKeys,
    deleteStorageKeys: deleteStoredImages,
};

export async function hydrateCanvasNodeImageMedia(node: CanvasNodeData, adapter: CanvasImageMediaAdapter = defaultCanvasImageMediaAdapter): Promise<CanvasNodeData> {
    if (node.type !== CanvasNodeType.Image || !node.metadata?.content) return node;
    const metadata = await hydrateImageMetadata(node.metadata, adapter);
    return metadata === node.metadata ? node : { ...node, metadata };
}

export async function hydrateCanvasNodesImageMedia(nodes: CanvasNodeData[], adapter: CanvasImageMediaAdapter = defaultCanvasImageMediaAdapter) {
    return Promise.all(nodes.map((node) => hydrateCanvasNodeImageMedia(node, adapter)));
}

export async function hydrateCanvasAssistantImageMedia(sessions: CanvasAssistantSession[], adapter: CanvasImageMediaAdapter = defaultCanvasImageMediaAdapter) {
    const hydrateItem = async <T extends { dataUrl?: string; storageKey?: string }>(item: T): Promise<T> => {
        if (item.storageKey) return { ...item, dataUrl: await adapter.resolveUrl(item.storageKey, item.dataUrl) };
        if (!item.dataUrl?.startsWith("data:image/")) return item;
        const image = await adapter.upload(item.dataUrl);
        return { ...item, dataUrl: image.url, storageKey: image.storageKey };
    };

    return Promise.all(
        sessions.map(async (session) => ({
            ...session,
            messages: await Promise.all(
                session.messages.map(async (message) => ({
                    ...message,
                    references: await Promise.all((message.references || []).map(hydrateItem)),
                    images: await Promise.all((message.images || []).map(hydrateItem)),
                })),
            ),
        })),
    );
}

export async function materializeCanvasImageMedia(input: CanvasImageMediaInput, adapter: CanvasImageMediaAdapter = defaultCanvasImageMediaAdapter): Promise<UploadedImage> {
    if (!input.storageKey) return adapter.upload(input.dataUrl);
    return {
        url: await adapter.resolveUrl(input.storageKey, input.dataUrl),
        storageKey: input.storageKey,
        width: input.width || 0,
        height: input.height || 0,
        bytes: input.bytes || 0,
        mimeType: input.mimeType || "image/png",
    };
}

export async function cleanupUnusedCanvasImageMedia(input: CanvasImageMediaCleanupInput, adapter: CanvasImageMediaAdapter = defaultCanvasImageMediaAdapter) {
    const usedKeys = collectCanvasImageStorageKeys(input);
    const unusedKeys = (await adapter.listStorageKeys()).filter((key) => !usedKeys.has(key));
    if (unusedKeys.length) await adapter.deleteStorageKeys(unusedKeys);
}

export function collectCanvasImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => {
        if (Array.isArray(item)) item.forEach((child) => collectCanvasImageStorageKeys(child, keys));
        else collectCanvasImageStorageKeys(item, keys);
    });
    return keys;
}

async function hydrateImageMetadata(metadata: CanvasNodeMetadata, adapter: CanvasImageMediaAdapter): Promise<CanvasNodeMetadata> {
    if (metadata.storageKey) return { ...metadata, content: await adapter.resolveUrl(metadata.storageKey, metadata.content) };
    if (!metadata.content?.startsWith("data:image/")) return metadata;
    return imageMetadata(await adapter.upload(metadata.content), metadata);
}

function imageMetadata(image: UploadedImage, metadata: CanvasNodeMetadata): CanvasNodeMetadata {
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
