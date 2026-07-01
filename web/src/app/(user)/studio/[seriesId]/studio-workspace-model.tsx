import type { ReactNode } from "react";
import { BookOpen, Clapperboard, Film, Palette, Users } from "lucide-react";

import type { StudioEpisode } from "@/services/studio-local";

export type StudioPipelineStep = {
    id: "script" | "art_direction" | "cast" | "storyboard_r2v" | "assembly";
    label: string;
    icon: ReactNode;
    status: "ready" | "idle" | "gated";
    statusLabel?: string;
};

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
