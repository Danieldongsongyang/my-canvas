import type { StudioSeries } from "@/services/studio-local";
import type { AiConfig, ModelCapability } from "@/stores/use-config-store";

export type ModelSelectionSource = "project" | "global" | "missing";

export type ModelSelection = {
    capability: ModelCapability;
    model: string;
    source: ModelSelectionSource;
    ready: boolean;
    reason: string;
};

type StudioModelPreferences = StudioSeries["modelPreferences"];

const capabilityLabels: Record<ModelCapability, string> = {
    text: "文本",
    image: "图像",
    video: "视频",
    audio: "音频",
};

export function selectEffectiveModel(input: {
    config: AiConfig;
    capability: ModelCapability;
    studioPreferences?: StudioModelPreferences;
    remoteModelsError?: string;
}): ModelSelection {
    const { config, capability, studioPreferences, remoteModelsError = "" } = input;
    const projectPreference = studioPreferenceForCapability(studioPreferences, capability);
    const globalModel = globalModelForCapability(config, capability);
    const availableModels = modelsForCapability(config, capability);
    const channelMode = config.channelMode || "remote";

    const projectModel = projectPreference.trim();
    if (channelMode === "local") {
        const selected = projectModel || globalModel;
        return withLocalReadiness(config, {
            capability,
            model: selected,
            source: projectModel ? "project" : selected ? "global" : "missing",
            reason: selected ? "" : `请先配置可用的${capabilityLabels[capability]}模型。`,
        });
    }

    if (remoteModelsError) {
        return {
            capability,
            model: "",
            source: "missing",
            ready: false,
            reason: remoteModelsError,
        };
    }

    if (projectModel && availableModels.includes(projectModel)) {
        return { capability, model: projectModel, source: "project", ready: true, reason: "" };
    }

    const fallback = availableModels.includes(globalModel) ? globalModel : availableModels[0] || "";
    if (fallback) {
        return {
            capability,
            model: fallback,
            source: "global",
            ready: true,
            reason: projectModel && projectModel !== fallback ? `项目偏好模型 ${projectModel} 当前不可用，已使用全局模型。` : "",
        };
    }

    return {
        capability,
        model: "",
        source: "missing",
        ready: false,
        reason: projectModel ? `项目偏好模型 ${projectModel} 当前不可用，且没有可用的${capabilityLabels[capability]}模型。` : `请先配置可用的${capabilityLabels[capability]}模型。`,
    };
}

function studioPreferenceForCapability(preferences: StudioModelPreferences | undefined, capability: ModelCapability) {
    if (!preferences) return "";
    if (capability === "text") return preferences.textModel ?? "";
    if (capability === "image") return preferences.imageModel ?? "";
    if (capability === "video") return preferences.videoModel ?? "";
    return "";
}

function globalModelForCapability(config: AiConfig, capability: ModelCapability) {
    if (capability === "text") return (config.textModel || config.model).trim();
    if (capability === "image") return config.imageModel.trim();
    if (capability === "video") return config.videoModel.trim();
    return config.audioModel.trim();
}

function modelsForCapability(config: AiConfig, capability: ModelCapability) {
    const models = capability === "text" ? config.textModels : capability === "image" ? config.imageModels : capability === "video" ? config.videoModels : config.audioModels;
    return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
}

function withLocalReadiness(config: AiConfig, selection: Omit<ModelSelection, "ready">): ModelSelection {
    if (!selection.model.trim()) return { ...selection, ready: false };
    const missingBaseUrl = !config.baseUrl.trim();
    const missingApiKey = !config.apiKey.trim();
    if (missingBaseUrl && missingApiKey) return { ...selection, ready: false, reason: "请先配置 Base URL 和 API Key。" };
    if (missingBaseUrl) return { ...selection, ready: false, reason: "请先配置 Base URL。" };
    if (missingApiKey) return { ...selection, ready: false, reason: "请先配置 API Key。" };
    return { ...selection, ready: true, reason: "" };
}
