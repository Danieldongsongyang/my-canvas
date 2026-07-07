export const DEFAULT_MAX_IMAGE_COUNT = 15;
export const DREAMINA_MAX_IMAGE_COUNT = 10;

export function isDreaminaImageModel(model: string | undefined) {
    return /^dreamina-image(?:-|$)/i.test((model || "").trim());
}

export function maxImageCountForModel(model: string | undefined) {
    return isDreaminaImageModel(model) ? DREAMINA_MAX_IMAGE_COUNT : DEFAULT_MAX_IMAGE_COUNT;
}

export function normalizeImageGenerationCount(value: string | number | undefined, model?: string, fallback = 1) {
    const count = Math.floor(Math.abs(Number(value)) || fallback);
    return Math.max(1, Math.min(maxImageCountForModel(model), count));
}
