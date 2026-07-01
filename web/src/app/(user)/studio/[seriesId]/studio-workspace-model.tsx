import type { ReactNode } from "react";
import { BookOpen, Clapperboard, Film, Palette, Users } from "lucide-react";

import type { StudioEpisode, StudioSeries } from "@/services/studio-local";
import type { AiConfig } from "@/stores/use-config-store";

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
    kind: "character" | "scene" | "prop";
    appearances: number;
    status: "ready" | "pending";
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
    candidateCount: number;
};

export type StudioModelPreferenceKey = keyof StudioSeries["modelPreferences"];

export type StudioModelSummaryItem = {
    key: StudioModelPreferenceKey;
    label: string;
    value: string;
    source: "project" | "global" | "missing";
};

export const FOLLOW_GLOBAL_MODEL_VALUE = "__studio_follow_global__";

const STUDIO_MODEL_LABELS: Record<StudioModelPreferenceKey, string> = {
    textModel: "文本",
    imageModel: "图像",
    videoModel: "视频",
};

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

export function buildStudioModelSummary(preferences: StudioSeries["modelPreferences"], config: AiConfig): StudioModelSummaryItem[] {
    return [
        buildStudioModelSummaryItem("textModel", preferences.textModel, config.textModel || config.model),
        buildStudioModelSummaryItem("imageModel", preferences.imageModel, config.imageModel),
        buildStudioModelSummaryItem("videoModel", preferences.videoModel, config.videoModel),
    ];
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
            characters: episode?.characters.map(({ name, description }) => ({ name, description })) ?? [],
            scenes: episode?.scenes.map(({ name, description }) => ({ name, description })) ?? [],
            props: episode?.props.map(({ name, description }) => ({ name, description })) ?? [],
            shotDrafts: episode?.shots.map(({ title, description, dialogue }) => ({ title, description, ...(dialogue ? { dialogue } : {}) })) ?? [],
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
            const prompt = shot.dialogue ? `${shot.description}\n对白：${shot.dialogue}` : shot.description;
            return {
                id: shot.id,
                title: shot.title,
                order: shot.order,
                prompt,
                hasDialogue: Boolean(shot.dialogue?.trim()),
                candidateCount: shot.assetRefs.filter((ref) => ref.role === "candidate" || ref.role === "selected").length,
            };
        });
}

function cleanModelPreference(value: string) {
    const normalized = value.trim();
    return normalized && normalized !== FOLLOW_GLOBAL_MODEL_VALUE ? normalized : undefined;
}

function buildStudioModelSummaryItem(key: StudioModelPreferenceKey, preference: string | undefined, globalModel: string): StudioModelSummaryItem {
    const projectModel = preference?.trim();
    if (projectModel) return { key, label: STUDIO_MODEL_LABELS[key], value: projectModel, source: "project" };
    const fallback = globalModel.trim();
    return { key, label: STUDIO_MODEL_LABELS[key], value: fallback || "未配置", source: fallback ? "global" : "missing" };
}

function buildCastItem(item: { id: string; name: string; description: string; assetRefs: unknown[] }, kind: StudioCastItem["kind"], episode: StudioEpisode): StudioCastItem {
    const appearances = episode.shots.reduce((count, shot) => {
        const haystack = `${shot.title}\n${shot.description}\n${shot.dialogue ?? ""}`;
        return count + countTextMentions(haystack, item.name);
    }, 0);
    return {
        id: item.id,
        name: item.name,
        description: item.description,
        kind,
        appearances,
        status: item.assetRefs.length > 0 ? "ready" : "pending",
    };
}

function countTextMentions(text: string, term: string) {
    const normalized = term.trim();
    if (!normalized) return 0;
    return text.split(normalized).length - 1;
}
