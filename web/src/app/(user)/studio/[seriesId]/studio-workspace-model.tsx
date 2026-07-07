import type { ReactNode } from "react";
import { BookOpen, Clapperboard, Film, Palette, Users } from "lucide-react";

import { selectEffectiveModel, type ModelSelection } from "@/lib/model-selection";
import type { StudioAssetRef, StudioEpisode, StudioSeries } from "@/services/studio-local";
import type { AiConfig, ModelCapability } from "@/stores/use-config-store";

export type StudioPipelineStep = {
    id: "script" | "art_direction" | "cast" | "storyboard_r2v" | "assembly";
    label: string;
    icon: ReactNode;
    status: "ready" | "idle" | "gated";
    statusLabel?: string;
};

export type StudioArtDirectionDraft = {
    status: "completed";
    presetId: string;
    name: string;
    positivePrompt: string;
    negativePrompt: string;
    savedAt: string;
};

export type StudioStylePreset = {
    id: string;
    category: "cinematic" | "anime" | "ink" | "editorial";
    name: string;
    subtitle: string;
    positivePrompt: string;
    negativePrompt: string;
    swatches: string[];
};

export type StudioCastItem = {
    id: string;
    name: string;
    description: string;
    prompt: string;
    kind: "character" | "scene" | "prop";
    appearances: number;
    status: "ready" | "pending" | "generating" | "failed";
    selectedAssetId?: string;
    candidateCount: number;
    lastError?: string;
};

export type StudioCastSection = {
    id: "characters" | "scenes" | "props";
    title: string;
    kind: StudioCastItem["kind"];
    items: StudioCastItem[];
};

export type StudioStoryboardCard = {
    id: string;
    title: string;
    order: number;
    prompt: string;
    hasDialogue: boolean;
    status: "ready" | "pending" | "generating" | "failed";
    selectedAssetId?: string;
    candidateCount: number;
    referenceCount: number;
    hasExplicitReferences: boolean;
    hasReadyReferences: boolean;
    lastError?: string;
    referenceChips: StudioStoryboardReferenceChip[];
    missingReferenceChips: StudioStoryboardMissingReferenceChip[];
    generationSummary?: {
        model?: string;
        count?: number;
        aspectRatio?: string;
        referenceAssetIds?: string[];
        generatedAt?: string;
    };
};

export type StudioStoryboardReferenceChip = {
    kind: "character" | "scene" | "prop";
    id: string;
    label: string;
    ready: boolean;
    selectedAssetId?: string;
};

export type StudioStoryboardMissingReferenceChip = {
    kind: StudioStoryboardReferenceChip["kind"];
    id: string;
    label: string;
    reason: "missing-selected-image" | "missing-entity";
};

export type StudioModelPreferenceKey = keyof StudioSeries["modelPreferences"];

export type StudioModelSummaryItem = {
    key: StudioModelPreferenceKey;
    label: string;
    value: string;
    source: ModelSelection["source"];
    ready: boolean;
    reason: string;
};

export const FOLLOW_GLOBAL_MODEL_VALUE = "__studio_follow_global__";

const STUDIO_MODEL_LABELS: Record<StudioModelPreferenceKey, string> = {
    textModel: "文本",
    imageModel: "图像",
    videoModel: "视频",
};

const STUDIO_MODEL_SUMMARY_FIELDS: Array<{ key: StudioModelPreferenceKey; capability: ModelCapability }> = [
    { key: "textModel", capability: "text" },
    { key: "imageModel", capability: "image" },
    { key: "videoModel", capability: "video" },
];

export const STUDIO_STYLE_PRESETS: StudioStylePreset[] = [
    {
        id: "cinematic-neon-noir",
        category: "cinematic",
        name: "雨夜霓虹电影感",
        subtitle: "高反差、湿润街面、青绿色轮廓光",
        positivePrompt: "cinematic neon noir, rainy night, wet asphalt reflections, teal rim light, dramatic shadows, production still, detailed character lighting",
        negativePrompt: "flat lighting, low detail, overexposed, blurry, distorted anatomy, cheap plastic texture",
        swatches: ["#101113", "#49d2c6", "#f0b45a"],
    },
    {
        id: "anime-key-visual",
        category: "anime",
        name: "动画主视觉",
        subtitle: "清晰角色线稿、明亮边缘、高饱和情绪色",
        positivePrompt: "anime key visual, clean line art, expressive eyes, crisp cel shading, vivid accent colors, cinematic composition, high detail background",
        negativePrompt: "messy lineart, muddy colors, photorealistic skin, low resolution, extra fingers",
        swatches: ["#161821", "#ff6b8b", "#ffd166"],
    },
    {
        id: "ink-wash-fantasy",
        category: "ink",
        name: "水墨奇幻",
        subtitle: "宣纸颗粒、留白、墨色层次和轻微金色点缀",
        positivePrompt: "modern ink wash fantasy, rice paper texture, elegant negative space, layered black ink, subtle gold accents, cinematic framing",
        negativePrompt: "heavy western oil paint, noisy texture, oversaturated colors, flat composition",
        swatches: ["#171717", "#d8d0c4", "#c8a45d"],
    },
    {
        id: "editorial-graphic",
        category: "editorial",
        name: "杂志图形感",
        subtitle: "强构图、块面色彩、干净背景，适合短剧封面感",
        positivePrompt: "editorial graphic illustration, bold composition, clean background, sharp silhouette, controlled color blocks, premium poster design",
        negativePrompt: "busy background, random decorations, weak silhouette, low contrast, generic stock photo",
        swatches: ["#f2eee7", "#101113", "#e24d42"],
    },
];

export function buildStudioModelPreferencesPatch(input: Record<StudioModelPreferenceKey, string>) {
    return {
        modelPreferences: {
            textModel: cleanModelPreference(input.textModel),
            imageModel: cleanModelPreference(input.imageModel),
            videoModel: cleanModelPreference(input.videoModel),
        },
    };
}

export function buildStudioModelSummary(preferences: StudioSeries["modelPreferences"], config: AiConfig, remoteModelsError = ""): StudioModelSummaryItem[] {
    return STUDIO_MODEL_SUMMARY_FIELDS.map(({ key, capability }) => buildStudioModelSummaryItem(key, selectEffectiveModel({ config, capability, studioPreferences: preferences, remoteModelsError })));
}

export function buildStudioPipelineSteps(episode: StudioEpisode): StudioPipelineStep[] {
    const hasParsedScript = Boolean(episode.generation?.scriptParser);
    const hasArtDirection = Boolean(episode.generation?.artDirection);
    const characterCount = episode.characters.length;
    const shotCount = episode.shots.length;
    const hasAssembly = Boolean(episode.generation?.assembly);

    return [
        {
            id: "script",
            label: "1. Script",
            icon: <BookOpen className="size-4" />,
            status: hasParsedScript || episode.script.trim() ? "ready" : "idle",
            statusLabel: hasParsedScript ? "已解析" : episode.script.trim() ? "有草稿" : "待输入",
        },
        {
            id: "art_direction",
            label: "2. Art Direction",
            icon: <Palette className="size-4" />,
            status: hasArtDirection ? "ready" : "idle",
            statusLabel: hasArtDirection ? "已设定" : "待设定",
        },
        {
            id: "cast",
            label: "3. Cast",
            icon: <Users className="size-4" />,
            status: characterCount > 0 ? "ready" : "idle",
            statusLabel: characterCount > 0 ? `${characterCount} 角色` : "待确认",
        },
        {
            id: "storyboard_r2v",
            label: "4. Storyboard",
            icon: <Clapperboard className="size-4" />,
            status: shotCount > 0 ? "ready" : "idle",
            statusLabel: shotCount > 0 ? `${shotCount} 镜头` : "待拆分",
        },
        {
            id: "assembly",
            label: "5. Assembly",
            icon: <Film className="size-4" />,
            status: hasAssembly ? "ready" : shotCount > 0 ? "idle" : "gated",
            statusLabel: hasAssembly ? "已组装" : shotCount > 0 ? "待组装" : "等待分镜",
        },
    ];
}

export function formatEpisodeStructure(episode: StudioEpisode | null) {
    return JSON.stringify(
        {
            characters: episode?.characters.map(({ name, description, prompt }) => ({ name, description, prompt: prompt || buildCastPromptFallback("character", name, description) })) ?? [],
            scenes: episode?.scenes.map(({ name, description, prompt }) => ({ name, description, prompt: prompt || buildCastPromptFallback("scene", name, description) })) ?? [],
            props: episode?.props.map(({ name, description, prompt }) => ({ name, description, prompt: prompt || buildCastPromptFallback("prop", name, description) })) ?? [],
            shotDrafts:
                episode?.shots.map((shot) => ({
                    id: shot.id,
                    title: shot.title,
                    description: shot.description,
                    ...(shot.dialogue ? { dialogue: shot.dialogue } : {}),
                    prompt: shot.prompt || buildShotPromptFallback(shot),
                    references: readShotReferences(shot),
                })) ?? [],
        },
        null,
        2,
    );
}

export function normalizeArtDirectionDraft(input: { presetId?: string; name?: string; positivePrompt?: string; negativePrompt?: string }): StudioArtDirectionDraft {
    const fallback = STUDIO_STYLE_PRESETS[0];
    const preset = STUDIO_STYLE_PRESETS.find((item) => item.id === input.presetId) ?? fallback;
    return {
        status: "completed",
        presetId: input.presetId || preset.id,
        name: input.name?.trim() || preset.name,
        positivePrompt: input.positivePrompt?.trim() || preset.positivePrompt,
        negativePrompt: input.negativePrompt?.trim() || preset.negativePrompt,
        savedAt: new Date().toISOString(),
    };
}

export function readArtDirectionDraft(episode: StudioEpisode): StudioArtDirectionDraft | null {
    const value = episode.generation?.artDirection;
    if (!value || typeof value !== "object") return null;
    const draft = value as Partial<StudioArtDirectionDraft>;
    if (!draft.positivePrompt || !draft.name) return null;
    return {
        status: "completed",
        presetId: draft.presetId || "custom",
        name: draft.name,
        positivePrompt: draft.positivePrompt,
        negativePrompt: draft.negativePrompt || "",
        savedAt: draft.savedAt || "",
    };
}

export function buildCastSections(episode: StudioEpisode): StudioCastSection[] {
    return [
        {
            id: "characters",
            title: "角色",
            kind: "character",
            items: episode.characters.map((item) => buildCastItem(item, "character", episode)),
        },
        {
            id: "scenes",
            title: "场景",
            kind: "scene",
            items: episode.scenes.map((item) => buildCastItem(item, "scene", episode)),
        },
        {
            id: "props",
            title: "道具",
            kind: "prop",
            items: episode.props.map((item) => buildCastItem(item, "prop", episode)),
        },
    ];
}

export function buildStoryboardCards(episode: StudioEpisode): StudioStoryboardCard[] {
    return [...episode.shots]
        .sort((a, b) => a.order - b.order)
        .map((shot) => {
            const prompt = shot.prompt?.trim() || buildShotPromptFallback(shot);
            const references = readShotReferences(shot);
            const referencedIds = [...references.characterIds, ...references.sceneIds, ...references.propIds];
            const selectedRef = getSelectedImageRef(shot.assetRefs);
            const generation = readShotImageGeneration(shot.generation);
            const referenceChips = buildStoryboardReferenceChips(episode, references);
            const missingReferenceChips = referenceChips
                .filter((chip) => !chip.ready)
                .map((chip) => ({
                    kind: chip.kind,
                    id: chip.id,
                    label: chip.label,
                    reason: chip.label ? ("missing-selected-image" as const) : ("missing-entity" as const),
                }));
            return {
                id: shot.id,
                title: shot.title,
                order: shot.order,
                prompt,
                hasDialogue: Boolean(shot.dialogue?.trim()),
                status: readShotStatus(Boolean(selectedRef), generation),
                selectedAssetId: selectedRef?.assetId,
                candidateCount: shot.assetRefs.filter((ref) => ref.role === "candidate" || ref.role === "selected").length,
                referenceCount: referencedIds.length,
                hasExplicitReferences: referencedIds.length > 0,
                hasReadyReferences: referencedIds.length > 0 && referenceChips.length === referencedIds.length && referenceChips.every((chip) => chip.ready),
                lastError: generation.lastImageError,
                referenceChips,
                missingReferenceChips,
                generationSummary: readStoryboardGenerationSummary(selectedRef),
            };
        });
}

function cleanModelPreference(value: string) {
    const normalized = value.trim();
    return normalized && normalized !== FOLLOW_GLOBAL_MODEL_VALUE ? normalized : undefined;
}

function buildStudioModelSummaryItem(key: StudioModelPreferenceKey, selection: ModelSelection): StudioModelSummaryItem {
    return {
        key,
        label: STUDIO_MODEL_LABELS[key],
        value: selection.model || "未配置",
        source: selection.source,
        ready: selection.ready,
        reason: selection.reason,
    };
}

function buildCastItem(item: { id: string; name: string; description: string; prompt?: string; assetRefs: StudioAssetRef[]; generation?: Record<string, unknown> }, kind: StudioCastItem["kind"], episode: StudioEpisode): StudioCastItem {
    const appearances = episode.shots.reduce((count, shot) => {
        const haystack = `${shot.title}\n${shot.description}\n${shot.dialogue ?? ""}`;
        return count + countTextMentions(haystack, item.name);
    }, 0);
    const selectedRef = item.assetRefs.find((ref) => ref.kind === "image" && ref.role === "selected");
    const candidateCount = item.assetRefs.filter((ref) => ref.kind === "image" && (ref.role === "selected" || ref.role === "candidate")).length;
    const imageGeneration = readCastImageGeneration(item.generation);
    return {
        id: item.id,
        name: item.name,
        description: item.description,
        prompt: item.prompt || buildCastPromptFallback(kind, item.name, item.description),
        kind,
        appearances,
        status: readCastStatus(Boolean(selectedRef), imageGeneration),
        selectedAssetId: selectedRef?.assetId,
        candidateCount,
        lastError: imageGeneration.lastImageError,
    };
}

function getSelectedImageRef(refs: StudioAssetRef[]) {
    return refs.find((ref) => ref.kind === "image" && ref.role === "selected");
}

function buildStoryboardReferenceChips(episode: StudioEpisode, references: ReturnType<typeof readShotReferences>): StudioStoryboardReferenceChip[] {
    return [
        ...references.characterIds.map((id) => buildStoryboardReferenceChip("character", id, episode.characters)),
        ...references.sceneIds.map((id) => buildStoryboardReferenceChip("scene", id, episode.scenes)),
        ...references.propIds.map((id) => buildStoryboardReferenceChip("prop", id, episode.props)),
    ];
}

function buildStoryboardReferenceChip(kind: StudioStoryboardReferenceChip["kind"], id: string, entities: Array<{ id: string; name: string; assetRefs: StudioAssetRef[] }>): StudioStoryboardReferenceChip {
    const entity = entities.find((item) => item.id === id);
    const selectedRef = entity ? getSelectedImageRef(entity.assetRefs) : undefined;
    return {
        kind,
        id,
        label: entity?.name ?? id,
        ready: Boolean(selectedRef),
        selectedAssetId: selectedRef?.assetId,
    };
}

function readShotReferences(shot: StudioEpisode["shots"][number]) {
    return {
        characterIds: Array.isArray(shot.metadata?.references?.characterIds) ? shot.metadata.references.characterIds : [],
        sceneIds: Array.isArray(shot.metadata?.references?.sceneIds) ? shot.metadata.references.sceneIds : [],
        propIds: Array.isArray(shot.metadata?.references?.propIds) ? shot.metadata.references.propIds : [],
    };
}

function buildShotPromptFallback(shot: Pick<StudioEpisode["shots"][number], "description" | "dialogue">) {
    return [shot.description.trim(), shot.dialogue?.trim() ? `对白：${shot.dialogue.trim()}` : ""].filter(Boolean).join("\n");
}

function countTextMentions(text: string, term: string) {
    const normalized = term.trim();
    if (!normalized) return 0;
    return text.split(normalized).length - 1;
}

function readCastImageGeneration(generation: Record<string, unknown> | undefined): { status?: string; lastImageError?: string } {
    const image = generation?.image;
    if (!image || typeof image !== "object") return {};
    const draft = image as { status?: unknown; lastImageError?: unknown };
    return {
        status: typeof draft.status === "string" ? draft.status : undefined,
        lastImageError: typeof draft.lastImageError === "string" ? draft.lastImageError : undefined,
    };
}

function readShotImageGeneration(generation: Record<string, unknown> | undefined): { status?: string; lastImageError?: string } {
    const image = generation?.image;
    if (!image || typeof image !== "object") return {};
    const draft = image as { status?: unknown; lastImageError?: unknown };
    return {
        status: typeof draft.status === "string" ? draft.status : undefined,
        lastImageError: typeof draft.lastImageError === "string" ? draft.lastImageError : undefined,
    };
}

function readCastStatus(hasSelectedImage: boolean, imageGeneration: { status?: string }): StudioCastItem["status"] {
    if (imageGeneration.status === "processing") return "generating";
    if (hasSelectedImage) return "ready";
    if (imageGeneration.status === "failed") return "failed";
    return "pending";
}

function readShotStatus(hasSelectedImage: boolean, imageGeneration: { status?: string }): StudioStoryboardCard["status"] {
    if (imageGeneration.status === "processing") return "generating";
    if (hasSelectedImage) return "ready";
    if (imageGeneration.status === "failed") return "failed";
    return "pending";
}

function readStoryboardGenerationSummary(selectedRef: StudioAssetRef | undefined): StudioStoryboardCard["generationSummary"] {
    const metadata = selectedRef?.metadata;
    if (!metadata) return undefined;
    const referenceAssetIds = Array.isArray(metadata.referenceAssetIds) ? metadata.referenceAssetIds.filter((id): id is string => typeof id === "string") : undefined;
    return {
        model: typeof metadata.model === "string" ? metadata.model : undefined,
        count: typeof metadata.count === "number" ? metadata.count : undefined,
        aspectRatio: typeof metadata.aspectRatio === "string" ? metadata.aspectRatio : undefined,
        referenceAssetIds,
        generatedAt: typeof metadata.generatedAt === "string" ? metadata.generatedAt : typeof metadata.createdAt === "string" ? metadata.createdAt : undefined,
    };
}

function buildCastPromptFallback(kind: StudioCastItem["kind"], name: string, description: string) {
    const base = [name, description]
        .map((part) => part.trim())
        .filter(Boolean)
        .join("，");
    if (kind === "character") return `${base}，角色参考设定图，清晰外貌、服装、气质和轮廓。`;
    if (kind === "scene") return `${base}，场景参考图，清晰空间结构、时间、光线和氛围。`;
    return `${base}，道具参考图，清晰形态、材质、尺寸感和细节。`;
}
