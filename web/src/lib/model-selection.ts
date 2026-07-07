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

type SelectEffectiveModelInput = {
    config: AiConfig;
    capability: ModelCapability;
    studioPreferences?: StudioModelPreferences;
    remoteModelsError?: string;
};

const capabilityLabels: Record<ModelCapability, string> = {
    text: "文本",
    image: "图像",
    video: "视频",
    audio: "音频",
};

export function selectEffectiveModel(input: SelectEffectiveModelInput): ModelSelection {
    const { config, capability, studioPreferences, remoteModelsError = "" } = input;
    const projectModel = studioPreferenceForCapability(studioPreferences, capability).trim();
    const globalModel = globalModelForCapability(config, capability);
    const channelMode = config.channelMode || "remote";

    if (channelMode === "local") {
        return selectLocalModel(config, capability, projectModel, globalModel);
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

    const availableModels = modelsForCapability(config, capability);
    if (projectModel && availableModels.includes(projectModel)) {
        return { capability, model: projectModel, source: "project", ready: true, reason: "" };
    }

    const fallback = selectRemoteFallback(globalModel, availableModels);
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
        reason: projectModel ? `项目偏好模型 ${projectModel} 当前不可用，且没有可用的${capabilityLabels[capability]}模型。` : missingModelReason(capability),
    };
}

function selectLocalModel(config: AiConfig, capability: ModelCapability, projectModel: string, globalModel: string): ModelSelection {
    const selected = projectModel || globalModel;
    return withLocalReadiness(config, {
        capability,
        model: selected,
        source: selectionSource(projectModel, selected),
        reason: selected ? "" : missingModelReason(capability),
    });
}

function selectionSource(projectModel: string, selectedModel: string): ModelSelectionSource {
    if (projectModel) return "project";
    if (selectedModel) return "global";
    return "missing";
}

function selectRemoteFallback(globalModel: string, availableModels: string[]) {
    if (availableModels.includes(globalModel)) return globalModel;
    return availableModels[0] || "";
}

function missingModelReason(capability: ModelCapability) {
    return `请先配置可用的${capabilityLabels[capability]}模型。`;
}

function studioPreferenceForCapability(preferences: StudioModelPreferences | undefined, capability: ModelCapability) {
    if (!preferences) return "";
    switch (capability) {
        case "text":
            return preferences.textModel ?? "";
        case "image":
            return preferences.imageModel ?? "";
        case "video":
            return preferences.videoModel ?? "";
        case "audio":
        default:
            return "";
    }
}

function globalModelForCapability(config: AiConfig, capability: ModelCapability) {
    switch (capability) {
        case "text":
            return (config.textModel || config.model).trim();
        case "image":
            return config.imageModel.trim();
        case "video":
            return config.videoModel.trim();
        case "audio":
        default:
            return config.audioModel.trim();
    }
}

function modelsForCapability(config: AiConfig, capability: ModelCapability) {
    const models = modelListForCapability(config, capability);
    return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
}

function modelListForCapability(config: AiConfig, capability: ModelCapability) {
    switch (capability) {
        case "text":
            return config.textModels;
        case "image":
            return config.imageModels;
        case "video":
            return config.videoModels;
        case "audio":
        default:
            return config.audioModels;
    }
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
