import axios from "axios";
import { nanoid } from "nanoid";
import { z } from "zod";

import { aiApiUrl, aiRequestHeaders, refreshRemoteUser } from "@/services/api/ai-request";
import type { StudioAssetRef, StudioEpisodePatch, StudioShot, StudioShotReferences, StudioCharacter, StudioProp, StudioScene, createStudioRepository, StudioEpisode, StudioSeries } from "@/services/studio-local";
import type { Asset } from "@/stores/use-asset-store";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

export type StudioChatMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};

export type StudioScriptParseResult = Pick<StudioEpisodePatch, "characters" | "scenes" | "props" | "shots"> & {
    model: string;
    rawText: string;
};

export type StudioScriptStructure = Pick<StudioEpisodePatch, "characters" | "scenes" | "props" | "shots">;

type StudioRepository = ReturnType<typeof createStudioRepository>;

type ParseScriptInput = {
    script: string;
    config: AiConfig;
    requestChat?: StudioChatRequester;
};

type ParseAndApplyScriptInput = ParseScriptInput & {
    repository: StudioRepository;
    seriesId: string;
    episodeId: string;
};

type ParseAndApplyScriptResult = {
    series: StudioSeries;
    episode: StudioEpisode;
    parseResult: StudioScriptParseResult;
};

type StudioChatRequester = (config: AiConfig, messages: StudioChatMessage[]) => Promise<string>;

export type StudioCastTargetKind = "character" | "scene" | "prop";

export type GenerateCastTarget = { mode: "allMissing" } | { mode: "failedOnly" } | { mode: "ids"; kind: StudioCastTargetKind; ids: string[] };

export type StudioImageRequester = (config: AiConfig, prompt: string) => Promise<Array<{ id: string; dataUrl: string }>>;
export type StudioImageEditRequester = (config: AiConfig, prompt: string, references: ReferenceImage[]) => Promise<Array<{ id: string; dataUrl: string }>>;

export type StudioImageStorage = (dataUrl: string) => Promise<{
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
}>;

export type StudioAssetCreator = (asset: Omit<Extract<Asset, { kind: "image" }>, "id" | "createdAt" | "updatedAt">) => string;

export type GenerateCastReferencesInput = {
    repository: StudioRepository;
    seriesId: string;
    episodeId: string;
    config: AiConfig;
    target: GenerateCastTarget;
    count: 1 | 2 | 4;
    addAsset: StudioAssetCreator;
    requestImages?: StudioImageRequester;
    storeImage?: StudioImageStorage;
    now?: () => string;
};

export type GenerateCastTargetResult = {
    kind: StudioCastTargetKind;
    id: string;
    name: string;
    status: "completed" | "failed" | "skipped";
    createdAssetIds: string[];
    selectedAssetId?: string;
    error?: string;
};

export type GenerateCastReferencesResult = {
    series: StudioSeries;
    episode: StudioEpisode;
    results: GenerateCastTargetResult[];
};

export type SelectCastAssetReferenceInput = {
    repository: StudioRepository;
    seriesId: string;
    episodeId: string;
    kind: StudioCastTargetKind;
    entityId: string;
    assetId: string;
};

export type RemoveCastCandidateReferenceInput = SelectCastAssetReferenceInput;

export type AddCastAssetReferenceInput = Omit<SelectCastAssetReferenceInput, "assetId"> & {
    asset: Pick<Asset, "id" | "kind">;
    role?: "candidate" | "selected";
    now?: () => string;
};

export type UpdateCastEntityPromptInput = {
    repository: StudioRepository;
    seriesId: string;
    episodeId: string;
    kind: StudioCastTargetKind;
    entityId: string;
    prompt: string;
};

export type UpdateShotPromptInput = {
    repository: StudioRepository;
    seriesId: string;
    episodeId: string;
    shotId: string;
    prompt: string;
};

export type UpdateShotReferencesInput = {
    repository: StudioRepository;
    seriesId: string;
    episodeId: string;
    shotId: string;
    references: StudioShotReferences;
};

export type GenerateStoryboardShotImagesInput = {
    repository: StudioRepository;
    seriesId: string;
    episodeId: string;
    shotId: string;
    config: AiConfig;
    assets: Asset[];
    count: 1 | 2 | 4;
    allowNoReferences?: boolean;
    addAsset: StudioAssetCreator;
    requestEdit?: StudioImageEditRequester;
    requestGeneration?: StudioImageRequester;
    storeImage?: StudioImageStorage;
    now?: () => string;
};

export type GenerateStoryboardShotImagesResult = {
    series: StudioSeries;
    episode: StudioEpisode;
    createdAssetIds: string[];
    selectedAssetId?: string;
};

type ChatCompletionPayload = {
    model: string;
    messages: StudioChatMessage[];
    temperature: number;
    response_format?: { type: "json_object" };
};

const parsedItemSchema = z.object({
    id: z.string().trim().optional(),
    name: z.string().trim().min(1),
    description: z.string().trim().default(""),
    prompt: z.string().trim().optional(),
});

const parsedShotSchema = z.object({
    id: z.string().trim().optional(),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    dialogue: z.string().trim().optional(),
    prompt: z.string().trim().optional(),
    references: z
        .object({
            characters: z.array(z.string().trim()).optional(),
            scenes: z.array(z.string().trim()).optional(),
            props: z.array(z.string().trim()).optional(),
            characterIds: z.array(z.string().trim()).optional(),
            sceneIds: z.array(z.string().trim()).optional(),
            propIds: z.array(z.string().trim()).optional(),
        })
        .optional(),
});

const scriptParseSchema = z.object({
    characters: z.array(parsedItemSchema).default([]),
    scenes: z.array(parsedItemSchema).default([]),
    props: z.array(parsedItemSchema).default([]),
    shotDrafts: z.array(parsedShotSchema).min(1),
});

export class StudioGenerationError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message);
        this.name = "StudioGenerationError";
        this.cause = options?.cause;
    }
}

export async function requestStudioChatCompletion(config: AiConfig, messages: StudioChatMessage[]) {
    try {
        let response: StudioChatCompletionResponse;
        try {
            response = await sendChatCompletion(config, {
                model: config.textModel || config.model,
                messages,
                temperature: 0.2,
                response_format: { type: "json_object" },
            });
        } catch (error) {
            if (!isUnsupportedResponseFormatError(error)) throw error;
            response = await sendChatCompletion(config, {
                model: config.textModel || config.model,
                messages,
                temperature: 0.2,
            });
        }
        const content = response.choices?.[0]?.message?.content;
        if (!content) throw new StudioGenerationError(response.error?.message || response.msg || "剧本解析没有返回内容");
        refreshRemoteUser(config);
        return content;
    } catch (error) {
        if (error instanceof StudioGenerationError) throw error;
        throw new StudioGenerationError("剧本解析请求失败，请稍后重试或先手动编辑。", { cause: error });
    }
}

export async function parseScript({ script, config, requestChat = requestStudioChatCompletion }: ParseScriptInput): Promise<StudioScriptParseResult> {
    const normalizedScript = script.trim();
    if (!normalizedScript) throw new StudioGenerationError("请先输入剧本内容。");

    const model = config.textModel || config.model;
    if (!model.trim()) throw new StudioGenerationError("请先配置可用的文本模型。");

    const effectiveConfig = { ...config, model, textModel: model };
    const rawText = await requestChat(effectiveConfig, buildScriptParseMessages(normalizedScript));
    const parsed = parseStructuredJson(rawText);
    const structure = normalizeScriptStructure(parsed);

    return {
        model,
        rawText,
        ...structure,
    };
}

export function normalizeScriptStructure(payload: unknown, options: { previousEpisode?: StudioEpisode } = {}): StudioScriptStructure {
    const validated = scriptParseSchema.safeParse(payload);
    if (!validated.success) {
        throw new StudioGenerationError("AI 返回内容无法识别为 Studio 剧本结构，请保留剧本并手动编辑或重新解析。", { cause: validated.error });
    }
    const characters = validated.data.characters.map((item) => toStudioCharacter(item, options.previousEpisode));
    const scenes = validated.data.scenes.map((item) => toStudioScene(item, options.previousEpisode));
    const props = validated.data.props.map((item) => toStudioProp(item, options.previousEpisode));

    return {
        characters,
        scenes,
        props,
        shots: validated.data.shotDrafts.map((shot, index) => toStudioShot(shot, index, { characters, scenes, props, previousEpisode: options.previousEpisode })),
    };
}

export async function parseAndApplyScript(input: ParseAndApplyScriptInput): Promise<ParseAndApplyScriptResult> {
    const parseResult = await parseScript(input);
    const currentSeries = await input.repository.getSeries(input.seriesId);
    const currentEpisode = currentSeries?.episodes.find((episode) => episode.id === input.episodeId);
    const result = await input.repository.updateEpisode(input.seriesId, input.episodeId, {
        script: input.script,
        characters: parseResult.characters,
        scenes: parseResult.scenes,
        props: parseResult.props,
        shots: parseResult.shots,
        generation: {
            ...currentEpisode?.generation,
            scriptParser: {
                model: parseResult.model,
                status: "completed",
                parsedAt: new Date().toISOString(),
            },
        },
    });
    return { ...result, parseResult };
}

export async function generateCastReferences(input: GenerateCastReferencesInput): Promise<GenerateCastReferencesResult> {
    const requestImages = input.requestImages ?? defaultRequestImages;
    const storeImage = input.storeImage ?? defaultStoreImage;
    const now = input.now ?? (() => new Date().toISOString());
    const currentSeries = await input.repository.getSeries(input.seriesId);
    const currentEpisode = currentSeries?.episodes.find((episode) => episode.id === input.episodeId);
    if (!currentSeries || !currentEpisode) throw new StudioGenerationError("Studio 剧集不存在。");

    const artDirection = readStudioArtDirection(currentEpisode);
    if (!artDirection?.positivePrompt) throw new StudioGenerationError("请先保存 Style 定调。");
    const model = currentSeries.modelPreferences.imageModel || input.config.imageModel;
    if (!model.trim()) throw new StudioGenerationError("请先配置可用的图像模型。");

    let series = currentSeries;
    let episode = currentEpisode;
    const results: GenerateCastTargetResult[] = [];
    const targets = selectCastTargets(episode, input.target);

    for (const target of targets) {
        const startedAt = now();
        const entity = getCastEntity(episode, target.kind, target.id);
        if (!entity) continue;
        const snapshot = buildCastGenerationSnapshot({ kind: target.kind, entity, artDirection, model, count: input.count, createdAt: startedAt });
        try {
            const images = await requestImages({ ...input.config, model, imageModel: model, count: String(input.count), size: snapshot.aspectRatio }, snapshot.effectivePrompt);
            if (!images.length) throw new StudioGenerationError("接口没有返回图片");
            const refs: StudioAssetRef[] = [];
            const createdAssetIds: string[] = [];
            for (const [index, image] of images.entries()) {
                const stored = await storeImage(image.dataUrl);
                const assetId = input.addAsset({
                    kind: "image",
                    title: `${entity.name} 参考图 ${index + 1}`,
                    coverUrl: stored.url,
                    tags: ["Studio", "Cast", castKindLabel(target.kind)],
                    source: "Studio Cast",
                    data: {
                        dataUrl: stored.url,
                        storageKey: stored.storageKey,
                        width: stored.width,
                        height: stored.height,
                        bytes: stored.bytes,
                        mimeType: stored.mimeType,
                    },
                    metadata: {
                        source: "studio-cast",
                        seriesId: input.seriesId,
                        episodeId: input.episodeId,
                        entityKind: target.kind,
                        entityId: entity.id,
                        entityName: entity.name,
                        prompt: snapshot.prompt,
                        style: artDirection.name,
                        stylePrompt: artDirection.positivePrompt,
                        effectivePrompt: snapshot.effectivePrompt,
                        negativePrompt: snapshot.negativePrompt,
                        model,
                        aspectRatio: snapshot.aspectRatio,
                        createdAt: startedAt,
                    },
                });
                createdAssetIds.push(assetId);
                refs.push({
                    assetId,
                    kind: "image",
                    note: "Studio Cast 参考图",
                    metadata: {
                        source: "studio-cast",
                        entityKind: target.kind,
                        entityId: entity.id,
                        prompt: snapshot.prompt,
                        style: artDirection.name,
                        stylePrompt: artDirection.positivePrompt,
                        effectivePrompt: snapshot.effectivePrompt,
                        negativePrompt: snapshot.negativePrompt,
                        model,
                        aspectRatio: snapshot.aspectRatio,
                        generatedAt: startedAt,
                    },
                });
            }
            const latestEntity = getCastEntity(episode, target.kind, target.id);
            if (!latestEntity) continue;
            const updatedEntity = appendGeneratedImageRefs(latestEntity, refs, snapshot);
            const updated = await input.repository.updateEpisode(input.seriesId, input.episodeId, patchEpisodeCastEntity(episode, target.kind, updatedEntity));
            series = updated.series;
            episode = updated.episode;
            results.push({ kind: target.kind, id: entity.id, name: entity.name, status: "completed", createdAssetIds, selectedAssetId: getSelectedImageRef(updatedEntity)?.assetId });
        } catch (error) {
            const latestEntity = getCastEntity(episode, target.kind, target.id);
            if (!latestEntity) {
                results.push({ kind: target.kind, id: entity.id, name: entity.name, status: "failed", createdAssetIds: [], error: readGenerationError(error) });
                continue;
            }
            const failedEntity = withCastGenerationImage(latestEntity, {
                ...snapshot,
                status: "failed",
                lastImageError: readGenerationError(error),
            });
            const updated = await input.repository.updateEpisode(input.seriesId, input.episodeId, patchEpisodeCastEntity(episode, target.kind, failedEntity));
            series = updated.series;
            episode = updated.episode;
            results.push({ kind: target.kind, id: entity.id, name: entity.name, status: "failed", createdAssetIds: [], error: readGenerationError(error) });
        }
    }

    return { series, episode, results };
}

export async function selectCastAssetReference(input: SelectCastAssetReferenceInput): Promise<{ series: StudioSeries; episode: StudioEpisode }> {
    const series = await input.repository.getSeries(input.seriesId);
    const episode = series?.episodes.find((item) => item.id === input.episodeId);
    if (!series || !episode) throw new StudioGenerationError("Studio 剧集不存在。");
    const entity = getCastEntity(episode, input.kind, input.entityId);
    if (!entity) throw new StudioGenerationError("Cast 素材不存在。");

    const updatedEntity = {
        ...entity,
        assetRefs: selectImageAssetRef(entity.assetRefs, input.assetId),
    };
    return input.repository.updateEpisode(input.seriesId, input.episodeId, patchEpisodeCastEntity(episode, input.kind, updatedEntity));
}

export async function removeCastCandidateReference(input: RemoveCastCandidateReferenceInput): Promise<{ series: StudioSeries; episode: StudioEpisode }> {
    const series = await input.repository.getSeries(input.seriesId);
    const episode = series?.episodes.find((item) => item.id === input.episodeId);
    if (!series || !episode) throw new StudioGenerationError("Studio 剧集不存在。");
    const entity = getCastEntity(episode, input.kind, input.entityId);
    if (!entity) throw new StudioGenerationError("Cast 素材不存在。");

    const targetRef = entity.assetRefs.find((ref) => ref.kind === "image" && ref.assetId === input.assetId);
    if (!targetRef) return { series, episode };
    if (targetRef.role !== "candidate") throw new StudioGenerationError("只能移除 candidate 参考图。");

    const updatedEntity = {
        ...entity,
        assetRefs: entity.assetRefs.filter((ref) => !(ref.kind === "image" && ref.assetId === input.assetId && ref.role === "candidate")),
    };
    return input.repository.updateEpisode(input.seriesId, input.episodeId, patchEpisodeCastEntity(episode, input.kind, updatedEntity));
}

export async function addCastAssetReference(input: AddCastAssetReferenceInput): Promise<{ series: StudioSeries; episode: StudioEpisode }> {
    if (input.asset.kind !== "image") throw new StudioGenerationError("只能加入图片素材。");
    const series = await input.repository.getSeries(input.seriesId);
    const episode = series?.episodes.find((item) => item.id === input.episodeId);
    if (!series || !episode) throw new StudioGenerationError("Studio 剧集不存在。");
    const entity = getCastEntity(episode, input.kind, input.entityId);
    if (!entity) throw new StudioGenerationError("Cast 素材不存在。");

    const role = input.role ?? "candidate";
    const now = input.now ?? (() => new Date().toISOString());
    const assetRefs = upsertLibraryImageAssetRef(entity.assetRefs, {
        assetId: input.asset.id,
        role,
        kind: input.kind,
        entityId: input.entityId,
        createdAt: now(),
    });
    const updatedEntity = { ...entity, assetRefs };
    return input.repository.updateEpisode(input.seriesId, input.episodeId, patchEpisodeCastEntity(episode, input.kind, updatedEntity));
}

export async function updateCastEntityPrompt(input: UpdateCastEntityPromptInput): Promise<{ series: StudioSeries; episode: StudioEpisode }> {
    const prompt = input.prompt.trim();
    if (!prompt) throw new StudioGenerationError("Cast prompt 不能为空。");
    const series = await input.repository.getSeries(input.seriesId);
    const episode = series?.episodes.find((item) => item.id === input.episodeId);
    if (!series || !episode) throw new StudioGenerationError("Studio 剧集不存在。");
    const entity = getCastEntity(episode, input.kind, input.entityId);
    if (!entity) throw new StudioGenerationError("Cast 素材不存在。");

    return input.repository.updateEpisode(input.seriesId, input.episodeId, patchEpisodeCastEntity(episode, input.kind, { ...entity, prompt }));
}

export async function updateShotPrompt(input: UpdateShotPromptInput): Promise<{ series: StudioSeries; episode: StudioEpisode }> {
    const prompt = input.prompt.trim();
    if (!prompt) throw new StudioGenerationError("Shot prompt 不能为空。");
    const series = await input.repository.getSeries(input.seriesId);
    const episode = series?.episodes.find((item) => item.id === input.episodeId);
    if (!series || !episode) throw new StudioGenerationError("Studio 剧集不存在。");
    const shot = episode.shots.find((item) => item.id === input.shotId);
    if (!shot) throw new StudioGenerationError("镜头不存在。");

    return input.repository.updateEpisode(input.seriesId, input.episodeId, {
        shots: episode.shots.map((item) => (item.id === input.shotId ? { ...item, prompt } : item)),
    });
}

export async function updateShotReferences(input: UpdateShotReferencesInput): Promise<{ series: StudioSeries; episode: StudioEpisode }> {
    const series = await input.repository.getSeries(input.seriesId);
    const episode = series?.episodes.find((item) => item.id === input.episodeId);
    if (!series || !episode) throw new StudioGenerationError("Studio 剧集不存在。");
    const shot = episode.shots.find((item) => item.id === input.shotId);
    if (!shot) throw new StudioGenerationError("镜头不存在。");
    const references = normalizeShotReferences(input.references, episode);

    return input.repository.updateEpisode(input.seriesId, input.episodeId, {
        shots: episode.shots.map((item) =>
            item.id === input.shotId
                ? {
                      ...item,
                      metadata: {
                          ...item.metadata,
                          references,
                      },
                  }
                : item,
        ),
    });
}

export async function generateStoryboardShotImages(input: GenerateStoryboardShotImagesInput): Promise<GenerateStoryboardShotImagesResult> {
    const requestEdit = input.requestEdit ?? defaultRequestEdit;
    const requestGeneration = input.requestGeneration ?? defaultRequestImages;
    const storeImage = input.storeImage ?? defaultStoreImage;
    const now = input.now ?? (() => new Date().toISOString());
    const series = await input.repository.getSeries(input.seriesId);
    const episode = series?.episodes.find((item) => item.id === input.episodeId);
    if (!series || !episode) throw new StudioGenerationError("Studio 剧集不存在。");
    const shot = episode.shots.find((item) => item.id === input.shotId);
    if (!shot) throw new StudioGenerationError("镜头不存在。");

    const artDirection = readStudioArtDirection(episode);
    if (!artDirection?.positivePrompt) throw new StudioGenerationError("请先保存 Style 定调。");
    const model = series.modelPreferences.imageModel || input.config.imageModel;
    if (!model.trim()) throw new StudioGenerationError("请先配置可用的图像模型。");

    const snapshot = buildStoryboardGenerationSnapshot({ shot, artDirection, model, count: input.count, createdAt: now() });
    const references = collectStoryboardReferenceImages(episode, shot, input.assets);
    if (!references.length && !input.allowNoReferences) throw new StudioGenerationError("缺少 Cast selected reference images。请先补齐显式引用和主参考图，或明确允许无参考生成。");

    const images = references.length
        ? await requestEdit({ ...input.config, model, imageModel: model, count: String(input.count), size: snapshot.aspectRatio }, snapshot.effectivePrompt, references)
        : await requestGeneration({ ...input.config, model, imageModel: model, count: String(input.count), size: snapshot.aspectRatio }, snapshot.effectivePrompt);
    if (!images.length) throw new StudioGenerationError("接口没有返回图片");

    const batchId = nanoid();
    const refs: StudioAssetRef[] = [];
    const createdAssetIds: string[] = [];
    for (const [index, image] of images.entries()) {
        const stored = await storeImage(image.dataUrl);
        const metadata = {
            source: "studio-storyboard",
            seriesId: input.seriesId,
            episodeId: input.episodeId,
            shotId: shot.id,
            shotTitle: shot.title,
            prompt: snapshot.prompt,
            style: artDirection.name,
            stylePrompt: artDirection.positivePrompt,
            effectivePrompt: snapshot.effectivePrompt,
            negativePrompt: snapshot.negativePrompt,
            model,
            referenceAssetIds: references.map((reference) => reference.id),
            count: input.count,
            aspectRatio: snapshot.aspectRatio,
            batchId,
            createdAt: snapshot.createdAt,
        };
        const assetId = input.addAsset({
            kind: "image",
            title: `${shot.title} 分镜图 ${index + 1}`,
            coverUrl: stored.url,
            tags: ["Studio", "Storyboard"],
            source: "Studio Storyboard",
            data: {
                dataUrl: stored.url,
                storageKey: stored.storageKey,
                width: stored.width,
                height: stored.height,
                bytes: stored.bytes,
                mimeType: stored.mimeType,
            },
            metadata,
        });
        createdAssetIds.push(assetId);
        refs.push({
            assetId,
            kind: "image",
            note: "Studio Storyboard 分镜候选图",
            metadata: {
                ...metadata,
                generatedAt: snapshot.createdAt,
            },
        });
    }

    const updatedShot = appendGeneratedShotImageRefs(shot, refs, snapshot);
    const updated = await input.repository.updateEpisode(input.seriesId, input.episodeId, {
        shots: episode.shots.map((item) => (item.id === shot.id ? updatedShot : item)),
    });
    return { ...updated, createdAssetIds, selectedAssetId: getSelectedImageRef(updatedShot)?.assetId };
}

type StudioCastEntity = StudioCharacter | StudioScene | StudioProp;

type StudioArtDirectionSnapshot = {
    name: string;
    positivePrompt: string;
    negativePrompt: string;
};

type StudioCastGenerationSnapshot = {
    status?: "completed" | "failed";
    prompt: string;
    style: string;
    stylePrompt: string;
    effectivePrompt: string;
    negativePrompt: string;
    model: string;
    count: 1 | 2 | 4;
    aspectRatio: string;
    createdAt: string;
    lastImageError?: string;
};

type StudioStoryboardGenerationSnapshot = StudioCastGenerationSnapshot;

async function defaultRequestImages(config: AiConfig, prompt: string) {
    const { requestGeneration } = await import("@/services/api/image");
    return requestGeneration(config, prompt);
}

async function defaultRequestEdit(config: AiConfig, prompt: string, references: ReferenceImage[]) {
    const { requestEdit } = await import("@/services/api/image");
    return requestEdit(config, prompt, references);
}

async function defaultStoreImage(dataUrl: string) {
    const { uploadImage } = await import("@/services/image-storage");
    return uploadImage(dataUrl);
}

function readStudioArtDirection(episode: StudioEpisode): StudioArtDirectionSnapshot | null {
    const value = episode.generation?.artDirection;
    if (!value || typeof value !== "object") return null;
    const draft = value as { name?: unknown; positivePrompt?: unknown; negativePrompt?: unknown };
    const positivePrompt = typeof draft.positivePrompt === "string" ? draft.positivePrompt.trim() : "";
    if (!positivePrompt) return null;
    return {
        name: typeof draft.name === "string" ? draft.name : "",
        positivePrompt,
        negativePrompt: typeof draft.negativePrompt === "string" ? draft.negativePrompt.trim() : "",
    };
}

function selectCastTargets(episode: StudioEpisode, target: GenerateCastTarget): Array<{ kind: StudioCastTargetKind; id: string }> {
    if (target.mode === "ids") {
        const ids = new Set(target.ids);
        return castEntities(episode, target.kind)
            .filter((entity) => ids.has(entity.id))
            .map((entity) => ({ kind: target.kind, id: entity.id }));
    }

    const allTargets = [...episode.characters.map((entity) => ({ kind: "character" as const, entity })), ...episode.scenes.map((entity) => ({ kind: "scene" as const, entity })), ...episode.props.map((entity) => ({ kind: "prop" as const, entity }))];

    return allTargets
        .filter(({ entity }) => {
            const status = readCastImageGenerationStatus(entity);
            if (status === "processing") return false;
            if (target.mode === "failedOnly") return status === "failed";
            return !getSelectedImageRef(entity);
        })
        .map(({ kind, entity }) => ({ kind, id: entity.id }));
}

function castEntities(episode: StudioEpisode, kind: StudioCastTargetKind): StudioCastEntity[] {
    if (kind === "character") return episode.characters;
    if (kind === "scene") return episode.scenes;
    return episode.props;
}

function getCastEntity(episode: StudioEpisode, kind: StudioCastTargetKind, id: string): StudioCastEntity | undefined {
    return castEntities(episode, kind).find((entity) => entity.id === id);
}

function patchEpisodeCastEntity(episode: StudioEpisode, kind: StudioCastTargetKind, entity: StudioCastEntity): StudioEpisodePatch {
    if (kind === "character") return { characters: episode.characters.map((item) => (item.id === entity.id ? (entity as StudioCharacter) : item)) };
    if (kind === "scene") return { scenes: episode.scenes.map((item) => (item.id === entity.id ? (entity as StudioScene) : item)) };
    return { props: episode.props.map((item) => (item.id === entity.id ? (entity as StudioProp) : item)) };
}

function normalizeShotReferences(references: StudioShotReferences, episode: StudioEpisode): StudioShotReferences {
    return {
        characterIds: normalizeExistingIds(references.characterIds, episode.characters, "镜头引用包含不存在的角色"),
        sceneIds: normalizeExistingIds(references.sceneIds, episode.scenes, "镜头引用包含不存在的场景"),
        propIds: normalizeExistingIds(references.propIds, episode.props, "镜头引用包含不存在的道具"),
    };
}

function normalizeExistingIds(ids: string[], entities: Array<{ id: string }>, errorMessage: string) {
    const requested = new Set(ids.map((id) => id.trim()).filter(Boolean));
    const entityIds = new Set(entities.map((entity) => entity.id));
    const invalid = [...requested].find((id) => !entityIds.has(id));
    if (invalid) throw new StudioGenerationError(errorMessage);
    return entities.map((entity) => entity.id).filter((id) => requested.has(id));
}

function buildCastGenerationSnapshot(input: { kind: StudioCastTargetKind; entity: StudioCastEntity; artDirection: StudioArtDirectionSnapshot; model: string; count: 1 | 2 | 4; createdAt: string }): StudioCastGenerationSnapshot {
    const prompt = input.entity.prompt || normalizeCastPrompt(input.kind, input.entity);
    const castPrompt = buildCastReferencePrompt(input.kind, prompt);
    const effectivePrompt = `${castPrompt}\n\nStyle baseline:\n${input.artDirection.positivePrompt}`;
    return {
        prompt,
        style: input.artDirection.name,
        stylePrompt: input.artDirection.positivePrompt,
        effectivePrompt,
        negativePrompt: [input.artDirection.negativePrompt, castKindNegativePrompt(input.kind)].filter(Boolean).join(", "),
        model: input.model,
        count: input.count,
        aspectRatio: castKindAspectRatio(input.kind),
        createdAt: input.createdAt,
    };
}

function buildStoryboardGenerationSnapshot(input: { shot: StudioShot; artDirection: StudioArtDirectionSnapshot; model: string; count: 1 | 2 | 4; createdAt: string }): StudioStoryboardGenerationSnapshot {
    const prompt = readShotPrompt(input.shot);
    const effectivePrompt = `${prompt}\n\nStyle baseline:\n${input.artDirection.positivePrompt}`;
    return {
        prompt,
        style: input.artDirection.name,
        stylePrompt: input.artDirection.positivePrompt,
        effectivePrompt,
        negativePrompt: [input.artDirection.negativePrompt, "text, labels, watermark, UI overlay, panel borders, inconsistent character identity, distorted anatomy, low detail"].filter(Boolean).join(", "),
        model: input.model,
        count: input.count,
        aspectRatio: "16:9",
        createdAt: input.createdAt,
    };
}

function readShotPrompt(shot: StudioShot) {
    const prompt = shot.prompt?.trim();
    if (prompt) return prompt;
    return buildShotPromptFallback(shot);
}

function buildShotPromptFallback(shot: Pick<StudioShot, "description" | "dialogue">) {
    return [shot.description.trim(), shot.dialogue?.trim() ? `对白：${shot.dialogue.trim()}` : ""].filter(Boolean).join("\n");
}

function readShotReferences(shot: StudioShot): StudioShotReferences {
    return {
        characterIds: Array.isArray(shot.metadata?.references?.characterIds) ? shot.metadata.references.characterIds : [],
        sceneIds: Array.isArray(shot.metadata?.references?.sceneIds) ? shot.metadata.references.sceneIds : [],
        propIds: Array.isArray(shot.metadata?.references?.propIds) ? shot.metadata.references.propIds : [],
    };
}

function collectStoryboardReferenceImages(episode: StudioEpisode, shot: StudioShot, assets: Asset[]): ReferenceImage[] {
    const assetMap = new Map(assets.filter((asset) => asset.kind === "image").map((asset) => [asset.id, asset]));
    const refs = readShotReferences(shot);
    const entities = [...episode.characters.filter((entity) => refs.characterIds.includes(entity.id)), ...episode.scenes.filter((entity) => refs.sceneIds.includes(entity.id)), ...episode.props.filter((entity) => refs.propIds.includes(entity.id))];
    const images: ReferenceImage[] = [];
    for (const entity of entities) {
        const selected = getSelectedImageRef(entity);
        const asset = selected ? assetMap.get(selected.assetId) : undefined;
        if (!asset || asset.kind !== "image") continue;
        images.push({
            id: asset.id,
            name: asset.title,
            dataUrl: asset.data.dataUrl,
            url: asset.data.dataUrl,
            storageKey: asset.data.storageKey,
            type: asset.data.mimeType,
        });
    }
    return images;
}

export function buildCastReferencePrompt(kind: StudioCastTargetKind, prompt: string) {
    const normalizedPrompt = prompt.trim();
    if (kind === "character") {
        return [
            normalizedPrompt,
            "Composition: character reference sheet, single unified image, seamless layout without borders or frames, neutral gray background. Include a large head-and-shoulders portrait and full-body front / side / back views. Keep one consistent character identity, clothing, face, body proportions, and material details across all views. Soft studio lighting, clean readable silhouette.",
        ].join("\n\n");
    }
    if (kind === "scene") {
        return [
            normalizedPrompt,
            "Composition: wide establishing shot of the environment, single unified image, no foreground character blocking the view. Emphasize atmosphere, architecture, terrain structure, lighting, color palette, and usable spatial layout for future storyboard shots.",
        ].join("\n\n");
    }
    return [
        normalizedPrompt,
        "Composition: product photography style object reference, single unified image on neutral background. Main view centered at slight angle, with clear material, silhouette, scale cues, and detail close-ups. Clean studio lighting, subtle shadow beneath object.",
    ].join("\n\n");
}

function castKindNegativePrompt(kind: StudioCastTargetKind) {
    if (kind === "character") return "text, labels, watermark, UI overlay, panel borders, multiple separate images, inconsistent face, inconsistent outfit, distorted anatomy";
    if (kind === "scene") return "text, labels, watermark, UI overlay, random characters, cluttered composition, low detail";
    return "text, labels, watermark, UI overlay, messy background, duplicated objects, distorted shape";
}

function castKindAspectRatio(kind: StudioCastTargetKind) {
    if (kind === "character") return "9:16";
    if (kind === "scene") return "16:9";
    return "1:1";
}

function castKindLabel(kind: StudioCastTargetKind) {
    if (kind === "character") return "角色";
    if (kind === "scene") return "场景";
    return "道具";
}

function appendGeneratedImageRefs(entity: StudioCastEntity, refs: StudioAssetRef[], snapshot: StudioCastGenerationSnapshot): StudioCastEntity {
    const hasSelected = Boolean(getSelectedImageRef(entity));
    const nextRefs = [...entity.assetRefs];
    refs.forEach((ref, index) => {
        if (nextRefs.some((item) => item.kind === "image" && item.assetId === ref.assetId)) return;
        nextRefs.push({ ...ref, role: !hasSelected && index === 0 ? "selected" : "candidate" });
    });
    return withCastGenerationImage(
        {
            ...entity,
            assetRefs: normalizeSingleSelectedImageRef(nextRefs),
        },
        { ...snapshot, status: "completed" },
    );
}

function appendGeneratedShotImageRefs(shot: StudioShot, refs: StudioAssetRef[], snapshot: StudioStoryboardGenerationSnapshot): StudioShot {
    const hasSelected = Boolean(getSelectedImageRef(shot));
    const nextRefs = [...shot.assetRefs];
    refs.forEach((ref, index) => {
        if (nextRefs.some((item) => item.kind === "image" && item.assetId === ref.assetId)) return;
        nextRefs.push({ ...ref, role: !hasSelected && index === 0 ? "selected" : "candidate" });
    });
    return {
        ...shot,
        assetRefs: normalizeSingleSelectedImageRef(nextRefs),
        generation: {
            ...shot.generation,
            image: {
                status: "completed",
                lastPrompt: snapshot.prompt,
                lastStyle: snapshot.style,
                lastStylePrompt: snapshot.stylePrompt,
                lastEffectivePrompt: snapshot.effectivePrompt,
                lastNegativePrompt: snapshot.negativePrompt,
                lastModel: snapshot.model,
                lastCount: snapshot.count,
                lastAspectRatio: snapshot.aspectRatio,
                lastGeneratedAt: snapshot.createdAt,
            },
        },
    };
}

function withCastGenerationImage(entity: StudioCastEntity, snapshot: StudioCastGenerationSnapshot): StudioCastEntity {
    return {
        ...entity,
        generation: {
            ...entity.generation,
            image: {
                status: snapshot.status ?? "completed",
                lastPrompt: snapshot.prompt,
                lastStyle: snapshot.style,
                lastStylePrompt: snapshot.stylePrompt,
                lastEffectivePrompt: snapshot.effectivePrompt,
                lastNegativePrompt: snapshot.negativePrompt,
                lastModel: snapshot.model,
                lastCount: snapshot.count,
                lastAspectRatio: snapshot.aspectRatio,
                lastGeneratedAt: snapshot.createdAt,
                ...(snapshot.lastImageError ? { lastImageError: snapshot.lastImageError } : {}),
            },
        },
    };
}

function normalizeSingleSelectedImageRef(refs: StudioAssetRef[]) {
    let selectedSeen = false;
    return refs.map((ref) => {
        if (ref.kind !== "image" || ref.role !== "selected") return ref;
        if (!selectedSeen) {
            selectedSeen = true;
            return ref;
        }
        return { ...ref, role: "candidate" as const };
    });
}

function selectImageAssetRef(refs: StudioAssetRef[], assetId: string) {
    const deduped: StudioAssetRef[] = [];
    for (const ref of refs) {
        if (ref.kind === "image" && deduped.some((item) => item.kind === "image" && item.assetId === ref.assetId)) continue;
        deduped.push(ref);
    }
    if (!deduped.some((ref) => ref.kind === "image" && ref.assetId === assetId)) {
        deduped.push({ assetId, kind: "image", role: "candidate" });
    }
    return normalizeSingleSelectedImageRef(
        deduped.map((ref) => {
            if (ref.kind !== "image") return ref;
            if (ref.assetId === assetId) return { ...ref, role: "selected" as const };
            if (ref.role === "selected") return { ...ref, role: "candidate" as const };
            return ref;
        }),
    );
}

function upsertLibraryImageAssetRef(
    refs: StudioAssetRef[],
    input: {
        assetId: string;
        role: "candidate" | "selected";
        kind: StudioCastTargetKind;
        entityId: string;
        createdAt: string;
    },
) {
    const deduped: StudioAssetRef[] = [];
    for (const ref of refs) {
        if (ref.kind === "image" && deduped.some((item) => item.kind === "image" && item.assetId === ref.assetId)) continue;
        deduped.push(ref);
    }

    const hasExisting = deduped.some((ref) => ref.kind === "image" && ref.assetId === input.assetId);
    const nextRefs = hasExisting
        ? deduped
        : [
              ...deduped,
              {
                  assetId: input.assetId,
                  kind: "image" as const,
                  role: "candidate" as const,
                  note: "从素材库加入 Cast 参考池",
                  metadata: {
                      source: "asset-library",
                      entityKind: input.kind,
                      entityId: input.entityId,
                      createdAt: input.createdAt,
                  },
              },
          ];

    if (input.role === "candidate") return normalizeSingleSelectedImageRef(nextRefs);
    return normalizeSingleSelectedImageRef(
        nextRefs.map((ref) => {
            if (ref.kind !== "image") return ref;
            if (ref.assetId === input.assetId) return { ...ref, role: "selected" as const };
            if (ref.role === "selected") return { ...ref, role: "candidate" as const };
            return ref;
        }),
    );
}

function getSelectedImageRef(entity: Pick<StudioCastEntity | StudioShot, "assetRefs">) {
    return entity.assetRefs.find((ref) => ref.kind === "image" && ref.role === "selected");
}

function readCastImageGenerationStatus(entity: StudioCastEntity) {
    const image = entity.generation?.image;
    if (!image || typeof image !== "object") return "";
    const status = (image as { status?: unknown }).status;
    return typeof status === "string" ? status : "";
}

function readGenerationError(error: unknown) {
    return error instanceof Error ? error.message : "生成失败";
}

type StudioChatCompletionResponse = {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
    msg?: string;
};

async function sendChatCompletion(config: AiConfig, payload: ChatCompletionPayload) {
    const response = await axios.post<StudioChatCompletionResponse>(aiApiUrl(config, "/chat/completions"), payload, {
        headers: await aiRequestHeaders(config, "application/json"),
        withCredentials: true,
    });
    return response.data;
}

function isUnsupportedResponseFormatError(error: unknown) {
    if (!axios.isAxiosError<{ error?: { message?: string }; msg?: string; message?: string } | string>(error)) return false;
    const responseData = error.response?.data;
    const message = typeof responseData === "string" ? responseData : responseData?.error?.message || responseData?.msg || responseData?.message || "";
    return /response_format|json_object/i.test(message) && /unsupported|not supported|unknown|invalid/i.test(message);
}

function buildScriptParseMessages(script: string): StudioChatMessage[] {
    return [
        {
            role: "system",
            content: [
                "你是短漫剧 Studio 的剧本解析器。",
                "只返回 JSON，不要返回 Markdown 或解释。",
                "JSON 字段必须是 characters、scenes、props、shotDrafts。",
                "characters/scenes/props 每项包含 name、description、prompt。",
                "prompt 是用于生成该角色、场景或道具参考图的图像提示词初稿，不要包含全局画风。",
                "shotDrafts 每项包含 title、description、prompt、references，可选 dialogue。",
                "shotDrafts.prompt 是用于生成该镜头图片的提示词初稿，不要包含全局画风。",
                "shotDrafts.references 使用 characters/scenes/props 数组列出本次 JSON 中已经出现的角色、场景、道具名称。",
                "分镜按叙事顺序拆分，保持简洁但可直接进入分镜编辑。",
            ].join("\n"),
        },
        {
            role: "user",
            content: `请解析以下短漫剧剧本：\n\n${script}`,
        },
    ];
}

function parseStructuredJson(rawText: string) {
    const cleaned = rawText.trim();
    const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const jsonText = fenced?.[1] ?? extractJsonObject(cleaned);
    try {
        return JSON.parse(jsonText) as unknown;
    } catch (error) {
        throw new StudioGenerationError("AI 返回内容不是有效 JSON，请保留剧本并手动编辑或重新解析。", { cause: error });
    }
}

function extractJsonObject(value: string) {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return value;
    return value.slice(start, end + 1);
}

function toStudioCharacter(item: z.infer<typeof parsedItemSchema>, episode?: StudioEpisode): StudioCharacter {
    return { id: resolveEntityId(item, episode?.characters), name: item.name, description: item.description, prompt: normalizeCastPrompt("character", item), assetRefs: [] };
}

function toStudioScene(item: z.infer<typeof parsedItemSchema>, episode?: StudioEpisode): StudioScene {
    return { id: resolveEntityId(item, episode?.scenes), name: item.name, description: item.description, prompt: normalizeCastPrompt("scene", item), assetRefs: [] };
}

function toStudioProp(item: z.infer<typeof parsedItemSchema>, episode?: StudioEpisode): StudioProp {
    return { id: resolveEntityId(item, episode?.props), name: item.name, description: item.description, prompt: normalizeCastPrompt("prop", item), assetRefs: [] };
}

function resolveEntityId(item: z.infer<typeof parsedItemSchema>, previousItems: Array<{ id: string; name: string }> | undefined) {
    const explicitId = item.id?.trim();
    if (explicitId) return explicitId;
    return previousItems?.find((previous) => previous.name === item.name)?.id ?? nanoid();
}

function normalizeCastPrompt(kind: "character" | "scene" | "prop", item: z.infer<typeof parsedItemSchema>) {
    const explicitPrompt = item.prompt?.trim();
    if (explicitPrompt) return explicitPrompt;
    const base = [item.name, item.description]
        .map((part) => part.trim())
        .filter(Boolean)
        .join("，");
    if (kind === "character") return `${base}，角色参考设定图，清晰外貌、服装、气质和轮廓。`;
    if (kind === "scene") return `${base}，场景参考图，清晰空间结构、时间、光线和氛围。`;
    return `${base}，道具参考图，清晰形态、材质、尺寸感和细节。`;
}

function toStudioShot(
    item: z.infer<typeof parsedShotSchema>,
    index: number,
    context: {
        characters: StudioCharacter[];
        scenes: StudioScene[];
        props: StudioProp[];
        previousEpisode?: StudioEpisode;
    },
): StudioShot {
    const previousShot = findPreviousShot(item, index, context.previousEpisode);
    const prompt = item.prompt?.trim() || previousShot?.prompt?.trim() || buildShotPromptFallback(item);
    const references = item.references ? normalizeParsedShotReferences(item.references, context) : (previousShot?.metadata?.references ?? { characterIds: [], sceneIds: [], propIds: [] });
    return {
        id: item.id?.trim() || previousShot?.id || nanoid(),
        title: item.title,
        order: index + 1,
        description: item.description,
        dialogue: item.dialogue,
        prompt,
        assetRefs: [],
        metadata: {
            references,
        },
    };
}

function findPreviousShot(item: z.infer<typeof parsedShotSchema>, index: number, episode?: StudioEpisode) {
    if (!episode) return undefined;
    const id = item.id?.trim();
    if (id) {
        const byId = episode.shots.find((shot) => shot.id === id);
        if (byId) return byId;
    }
    return episode.shots[index]?.title === item.title ? episode.shots[index] : undefined;
}

function normalizeParsedShotReferences(
    references: NonNullable<z.infer<typeof parsedShotSchema>["references"]>,
    context: {
        characters: StudioCharacter[];
        scenes: StudioScene[];
        props: StudioProp[];
    },
): StudioShotReferences {
    return {
        characterIds: resolveParsedReferenceIds(references.characterIds, references.characters, context.characters),
        sceneIds: resolveParsedReferenceIds(references.sceneIds, references.scenes, context.scenes),
        propIds: resolveParsedReferenceIds(references.propIds, references.props, context.props),
    };
}

function resolveParsedReferenceIds(explicitIds: string[] | undefined, names: string[] | undefined, entities: Array<{ id: string; name: string }>) {
    const ids = new Set((explicitIds ?? []).map((id) => id.trim()).filter(Boolean));
    const namesSet = new Set((names ?? []).map((name) => name.trim()).filter(Boolean));
    return entities.filter((entity) => ids.has(entity.id) || namesSet.has(entity.name)).map((entity) => entity.id);
}
