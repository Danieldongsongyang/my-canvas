"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, App, Button, Checkbox, ConfigProvider, Input, List, Modal, Select, Tag, Tooltip, theme as antdTheme } from "antd";
import { ArrowLeft, Box, Check, ChevronRight, Clapperboard, Film, Image, Layers, Lock, MapPin, Palette, Pencil, Save, Settings2, Sparkles, Users, WandSparkles } from "lucide-react";

import {
    addCastAssetReference,
    generateCastReferences,
    generateStoryboardShotImages,
    normalizeScriptStructure,
    parseAndApplyScript,
    removeCastCandidateReference,
    selectCastAssetReference,
    StudioGenerationError,
    updateCastEntityPrompt,
    updateShotPrompt,
    updateShotReferences,
    type StudioCastTargetKind,
} from "@/services/api/studio-generation";
import { studioRepository, type StudioEpisode, type StudioSeries, type StudioShotReferences } from "@/services/studio-local";
import { useConfigStore } from "@/stores/use-config-store";
import type { AiConfig } from "@/stores/use-config-store";
import { useAssetStore } from "@/stores/use-asset-store";
import type { Asset } from "@/stores/use-asset-store";
import { getAssetCoverUrl } from "@/lib/local-asset-library";
import { cn } from "@/lib/utils";
import { CastWorkbenchModal } from "./components/cast-workbench-modal";
import {
    buildCastSections,
    buildStoryboardCards,
    buildStudioModelPreferencesPatch,
    buildStudioModelSummary,
    buildStudioPipelineSteps,
    FOLLOW_GLOBAL_MODEL_VALUE,
    formatEpisodeStructure,
    normalizeArtDirectionDraft,
    readArtDirectionDraft,
    STUDIO_STYLE_PRESETS,
    type StudioModelPreferenceKey,
    type StudioPipelineStep,
    type StudioStylePreset,
} from "./studio-workspace-model";

export default function StudioWorkspacePage() {
    const { message } = App.useApp();
    const router = useRouter();
    const params = useParams<{ seriesId: string }>();
    const [series, setSeries] = useState<StudioSeries | null>(null);
    const [hydrated, setHydrated] = useState(false);
    const [script, setScript] = useState("");
    const [saving, setSaving] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [parseError, setParseError] = useState("");
    const [structureDraft, setStructureDraft] = useState("");
    const [savingStructure, setSavingStructure] = useState(false);
    const [activeStep, setActiveStep] = useState<StudioPipelineStep["id"]>("script");
    const [selectedStyleId, setSelectedStyleId] = useState(STUDIO_STYLE_PRESETS[0].id);
    const [styleName, setStyleName] = useState(STUDIO_STYLE_PRESETS[0].name);
    const [positivePrompt, setPositivePrompt] = useState(STUDIO_STYLE_PRESETS[0].positivePrompt);
    const [negativePrompt, setNegativePrompt] = useState(STUDIO_STYLE_PRESETS[0].negativePrompt);
    const [savingArtDirection, setSavingArtDirection] = useState(false);
    const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
    const [savingModelSettings, setSavingModelSettings] = useState(false);
    const [generatingCast, setGeneratingCast] = useState(false);
    const [workbenchTarget, setWorkbenchTarget] = useState<{ kind: StudioCastTargetKind; entityId: string } | null>(null);
    const [shotWorkbenchId, setShotWorkbenchId] = useState<string | null>(null);
    const [generatingShot, setGeneratingShot] = useState(false);
    const [modelDraft, setModelDraft] = useState<Record<StudioModelPreferenceKey, string>>({
        textModel: FOLLOW_GLOBAL_MODEL_VALUE,
        imageModel: FOLLOW_GLOBAL_MODEL_VALUE,
        videoModel: FOLLOW_GLOBAL_MODEL_VALUE,
    });
    const config = useConfigStore((state) => state.config);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);

    const episode = useMemo<StudioEpisode | null>(() => series?.episodes[0] ?? null, [series]);
    const textModel = series?.modelPreferences.textModel || config.textModel || config.model;
    const imageModel = series?.modelPreferences.imageModel || config.imageModel;
    const modelSummary = useMemo(() => buildStudioModelSummary(series?.modelPreferences ?? {}, config), [series?.modelPreferences, config]);
    const steps = useMemo(() => (episode ? buildStudioPipelineSteps(episode) : []), [episode]);

    const syncArtDirectionDraft = (nextEpisode: StudioEpisode | null) => {
        const draft = nextEpisode ? readArtDirectionDraft(nextEpisode) : null;
        const preset = STUDIO_STYLE_PRESETS.find((item) => item.id === draft?.presetId) ?? STUDIO_STYLE_PRESETS[0];
        setSelectedStyleId(draft?.presetId ?? preset.id);
        setStyleName(draft?.name ?? preset.name);
        setPositivePrompt(draft?.positivePrompt ?? preset.positivePrompt);
        setNegativePrompt(draft?.negativePrompt ?? preset.negativePrompt);
    };

    useEffect(() => {
        async function loadSeries() {
            const nextSeries = await studioRepository.getSeries(params.seriesId);
            const nextEpisode = nextSeries?.episodes[0] ?? null;
            setSeries(nextSeries);
            setScript(nextEpisode?.script ?? "");
            setStructureDraft(formatEpisodeStructure(nextEpisode));
            syncArtDirectionDraft(nextEpisode);
            setHydrated(true);
        }

        void loadSeries();
    }, [params.seriesId]);

    const saveScript = async () => {
        if (!series || !episode) return;
        setSaving(true);
        try {
            const result = await studioRepository.updateEpisode(series.id, episode.id, { script });
            setSeries(result.series);
            setStructureDraft(formatEpisodeStructure(result.episode));
            message.success("已保存剧本草稿");
        } finally {
            setSaving(false);
        }
    };

    const saveStructureDraft = async () => {
        if (!series || !episode) return;
        setSavingStructure(true);
        setParseError("");
        try {
            const structure = normalizeScriptStructure(JSON.parse(structureDraft), { previousEpisode: episode });
            const result = await studioRepository.updateEpisode(series.id, episode.id, {
                characters: structure.characters,
                scenes: structure.scenes,
                props: structure.props,
                shots: structure.shots,
                generation: {
                    ...episode.generation,
                    manualStructure: {
                        status: "completed",
                        savedAt: new Date().toISOString(),
                    },
                },
            });
            setSeries(result.series);
            setStructureDraft(formatEpisodeStructure(result.episode));
            message.success("结构草稿已保存");
        } catch (error) {
            const fallback = error instanceof StudioGenerationError ? "结构草稿格式不正确，请检查 characters、scenes、props 和 shotDrafts。" : "结构草稿不是有效 JSON，请检查后再保存。";
            setParseError(fallback);
            message.error(fallback);
        } finally {
            setSavingStructure(false);
        }
    };

    const parseCurrentScript = async () => {
        if (!series || !episode) return;
        const normalizedScript = script.trim();
        if (!normalizedScript) {
            message.warning("请先输入剧本内容");
            return;
        }
        if (!isAiConfigReady(config, textModel)) {
            openConfigDialog(true);
            message.warning("请先配置可用的文本模型");
            return;
        }

        setParsing(true);
        setParseError("");
        try {
            const result = await parseAndApplyScript({
                repository: studioRepository,
                seriesId: series.id,
                episodeId: episode.id,
                script: normalizedScript,
                config: { ...config, model: textModel, textModel },
            });
            setSeries(result.series);
            setScript(result.episode.script);
            setStructureDraft(formatEpisodeStructure(result.episode));
            message.success("剧本解析已写入 Episode 01");
        } catch (error) {
            const fallback = error instanceof StudioGenerationError ? error.message : "剧本解析失败，请保留剧本并手动编辑或稍后重试。";
            setParseError(fallback);
            message.error(fallback);
        } finally {
            setParsing(false);
        }
    };

    const applyStylePreset = (preset: StudioStylePreset) => {
        setSelectedStyleId(preset.id);
        setStyleName(preset.name);
        setPositivePrompt(preset.positivePrompt);
        setNegativePrompt(preset.negativePrompt);
    };

    const openModelSettings = () => {
        if (!series) return;
        setModelDraft({
            textModel: series.modelPreferences.textModel || FOLLOW_GLOBAL_MODEL_VALUE,
            imageModel: series.modelPreferences.imageModel || FOLLOW_GLOBAL_MODEL_VALUE,
            videoModel: series.modelPreferences.videoModel || FOLLOW_GLOBAL_MODEL_VALUE,
        });
        setModelSettingsOpen(true);
    };

    const saveModelSettings = async () => {
        if (!series) return;
        setSavingModelSettings(true);
        try {
            const updated = await studioRepository.updateSeries(series.id, buildStudioModelPreferencesPatch(modelDraft));
            setSeries(updated);
            setModelSettingsOpen(false);
            message.success("生成设置已保存");
        } finally {
            setSavingModelSettings(false);
        }
    };

    const saveArtDirection = async () => {
        if (!series || !episode) return;
        setSavingArtDirection(true);
        try {
            const artDirection = normalizeArtDirectionDraft({
                presetId: selectedStyleId,
                name: styleName,
                positivePrompt,
                negativePrompt,
            });
            const result = await studioRepository.updateEpisode(series.id, episode.id, {
                generation: {
                    ...episode.generation,
                    artDirection,
                },
            });
            setSeries(result.series);
            syncArtDirectionDraft(result.episode);
            setActiveStep("cast");
            message.success("视觉风格已保存");
        } finally {
            setSavingArtDirection(false);
        }
    };

    const generateMissingCastReferences = async () => {
        await runCastGeneration({ target: { mode: "allMissing" }, count: 1 });
    };

    const generateWorkbenchCastReferences = async (kind: StudioCastTargetKind, entityId: string, prompt: string, count: 1 | 2 | 4) => {
        if (!series || !episode) return;
        const entity = findCastEntity(episode, kind, entityId);
        if (!entity) return;
        const normalizedPrompt = prompt.trim();
        if (!normalizedPrompt) {
            message.warning("请先填写基础 prompt");
            return;
        }
        if (normalizedPrompt !== entity.prompt) {
            const updated = await updateCastEntityPrompt({
                repository: studioRepository,
                seriesId: series.id,
                episodeId: episode.id,
                kind,
                entityId,
                prompt: normalizedPrompt,
            });
            setSeries(updated.series);
            setStructureDraft(formatEpisodeStructure(updated.episode));
        }
        await runCastGeneration({ target: { mode: "ids", kind, ids: [entityId] }, count });
    };

    const saveWorkbenchPrompt = async (kind: StudioCastTargetKind, entityId: string, prompt: string) => {
        if (!series || !episode) return;
        try {
            const updated = await updateCastEntityPrompt({
                repository: studioRepository,
                seriesId: series.id,
                episodeId: episode.id,
                kind,
                entityId,
                prompt,
            });
            setSeries(updated.series);
            setStructureDraft(formatEpisodeStructure(updated.episode));
            message.success("Prompt 已保存");
        } catch (error) {
            message.error(error instanceof StudioGenerationError ? error.message : "Prompt 保存失败");
        }
    };

    const selectWorkbenchReference = async (kind: StudioCastTargetKind, entityId: string, assetId: string) => {
        if (!series || !episode) return;
        try {
            const updated = await selectCastAssetReference({
                repository: studioRepository,
                seriesId: series.id,
                episodeId: episode.id,
                kind,
                entityId,
                assetId,
            });
            setSeries(updated.series);
            message.success("主参考图已更新");
        } catch (error) {
            message.error(error instanceof StudioGenerationError ? error.message : "主参考图更新失败");
        }
    };

    const removeWorkbenchCandidate = async (kind: StudioCastTargetKind, entityId: string, assetId: string) => {
        if (!series || !episode) return;
        try {
            const updated = await removeCastCandidateReference({
                repository: studioRepository,
                seriesId: series.id,
                episodeId: episode.id,
                kind,
                entityId,
                assetId,
            });
            setSeries(updated.series);
            message.success("已移除候选关系，素材仍保留在素材库");
        } catch (error) {
            message.error(error instanceof StudioGenerationError ? error.message : "候选关系移除失败");
        }
    };

    const addWorkbenchLibraryAsset = async (kind: StudioCastTargetKind, entityId: string, asset: Asset, role: "candidate" | "selected") => {
        if (!series || !episode) return;
        try {
            const updated = await addCastAssetReference({
                repository: studioRepository,
                seriesId: series.id,
                episodeId: episode.id,
                kind,
                entityId,
                asset,
                role,
            });
            setSeries(updated.series);
            message.success(role === "selected" ? "已设为主参考图" : "已加入候选池");
        } catch (error) {
            message.error(error instanceof StudioGenerationError ? error.message : "素材加入失败");
        }
    };

    const saveShotWorkbenchPrompt = async (shotId: string, prompt: string) => {
        if (!series || !episode) return;
        try {
            const updated = await updateShotPrompt({
                repository: studioRepository,
                seriesId: series.id,
                episodeId: episode.id,
                shotId,
                prompt,
            });
            setSeries(updated.series);
            setStructureDraft(formatEpisodeStructure(updated.episode));
            message.success("Shot prompt 已保存");
        } catch (error) {
            message.error(error instanceof StudioGenerationError ? error.message : "Shot prompt 保存失败");
        }
    };

    const saveShotWorkbenchReferences = async (shotId: string, references: { characterIds: string[]; sceneIds: string[]; propIds: string[] }) => {
        if (!series || !episode) return;
        try {
            const updated = await updateShotReferences({
                repository: studioRepository,
                seriesId: series.id,
                episodeId: episode.id,
                shotId,
                references,
            });
            setSeries(updated.series);
            setStructureDraft(formatEpisodeStructure(updated.episode));
            message.success("镜头引用已保存");
        } catch (error) {
            message.error(error instanceof StudioGenerationError ? error.message : "镜头引用保存失败");
        }
    };

    const generateShotWorkbenchImages = async (shotId: string, prompt: string, references: { characterIds: string[]; sceneIds: string[]; propIds: string[] }, count: 1 | 2 | 4, allowNoReferences: boolean) => {
        if (!series || !episode) return;
        const shot = episode.shots.find((item) => item.id === shotId);
        if (!shot) return;
        if (!readArtDirectionDraft(episode)) {
            setActiveStep("art_direction");
            message.warning("请先完成 Style 定调");
            return;
        }
        if (!isAiConfigReady(config, imageModel)) {
            openConfigDialog(true);
            message.warning("请先配置可用的图像模型");
            return;
        }
        setGeneratingShot(true);
        try {
            let currentEpisode = episode;
            if (prompt.trim() !== (shot.prompt ?? "").trim()) {
                const updated = await updateShotPrompt({
                    repository: studioRepository,
                    seriesId: series.id,
                    episodeId: episode.id,
                    shotId,
                    prompt,
                });
                setSeries(updated.series);
                currentEpisode = updated.episode;
            }
            const currentShot = currentEpisode.shots.find((item) => item.id === shotId);
            const currentReferences = currentShot?.metadata?.references;
            if (JSON.stringify(currentReferences ?? { characterIds: [], sceneIds: [], propIds: [] }) !== JSON.stringify(references)) {
                const updated = await updateShotReferences({
                    repository: studioRepository,
                    seriesId: series.id,
                    episodeId: episode.id,
                    shotId,
                    references,
                });
                setSeries(updated.series);
                currentEpisode = updated.episode;
            }
            const result = await generateStoryboardShotImages({
                repository: studioRepository,
                seriesId: series.id,
                episodeId: episode.id,
                shotId,
                config: { ...config, model: imageModel, imageModel },
                assets,
                count,
                allowNoReferences,
                addAsset,
            });
            setSeries(result.series);
            setStructureDraft(formatEpisodeStructure(result.episode));
            message.success(`已生成 ${result.createdAssetIds.length} 张分镜候选图`);
        } catch (error) {
            message.error(error instanceof StudioGenerationError ? error.message : "分镜候选图生成失败");
        } finally {
            setGeneratingShot(false);
        }
    };

    const runCastGeneration = async ({ target, count }: { target: Parameters<typeof generateCastReferences>[0]["target"]; count: 1 | 2 | 4 }) => {
        if (!series || !episode) return;
        if (!readArtDirectionDraft(episode)) {
            setActiveStep("art_direction");
            message.warning("请先完成 Style 定调");
            return;
        }
        if (!isAiConfigReady(config, imageModel)) {
            openConfigDialog(true);
            message.warning("请先配置可用的图像模型");
            return;
        }
        setGeneratingCast(true);
        try {
            const result = await generateCastReferences({
                repository: studioRepository,
                seriesId: series.id,
                episodeId: episode.id,
                config: { ...config, model: imageModel, imageModel },
                target,
                count,
                addAsset,
            });
            setSeries(result.series);
            const completed = result.results.filter((item) => item.status === "completed").length;
            const failed = result.results.filter((item) => item.status === "failed").length;
            if (!result.results.length) {
                message.info("没有缺失的 Cast 参考图");
            } else if (failed) {
                message.warning(`已生成 ${completed} 个参考图，${failed} 个失败`);
            } else {
                message.success(`已生成 ${completed} 个参考图`);
            }
        } catch (error) {
            message.error(error instanceof StudioGenerationError ? error.message : "Cast 参考图生成失败");
        } finally {
            setGeneratingCast(false);
        }
    };

    if (!hydrated) {
        return <main className="flex h-full items-center justify-center bg-background text-sm text-stone-500 dark:text-stone-400">正在加载 Studio 工作台...</main>;
    }

    if (!series || !episode) {
        return (
            <main className="flex h-full flex-col items-center justify-center bg-background text-center text-stone-950 dark:text-stone-100">
                <h1 className="text-2xl font-semibold">Studio 项目不存在</h1>
                <Button className="mt-6" icon={<ArrowLeft className="size-4" />} onClick={() => router.push("/studio")}>
                    返回项目库
                </Button>
            </main>
        );
    }

    return (
        <ConfigProvider theme={studioAntTheme}>
            <main className="relative flex h-full w-full overflow-hidden bg-[#0c0b0e] text-[#f2ede4]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_18%_0%,rgba(52,216,196,0.10),transparent_70%),radial-gradient(55%_45%_at_88%_100%,rgba(255,169,77,0.08),transparent_70%)]" />
                <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(rgba(255,255,255,0.42)_0.6px,transparent_0.6px)] [background-size:3px_3px]" />
                <PipelineRail series={series} episode={episode} steps={steps} modelSummary={modelSummary} activeStep={activeStep} onBack={() => router.push("/studio")} onStepChange={setActiveStep} onOpenModelSettings={openModelSettings} />
                <section className="relative z-10 flex min-w-0 flex-1 overflow-hidden">
                    {activeStep === "script" ? (
                        <ScriptProcessorStep
                            episode={episode}
                            script={script}
                            parseError={parseError}
                            parsing={parsing}
                            saving={saving}
                            structureDraft={structureDraft}
                            savingStructure={savingStructure}
                            onScriptChange={setScript}
                            onSaveScript={saveScript}
                            onParseScript={parseCurrentScript}
                            onStructureDraftChange={setStructureDraft}
                            onSaveStructureDraft={saveStructureDraft}
                        />
                    ) : activeStep === "art_direction" ? (
                        <ArtDirectionStep
                            episode={episode}
                            selectedStyleId={selectedStyleId}
                            styleName={styleName}
                            positivePrompt={positivePrompt}
                            negativePrompt={negativePrompt}
                            saving={savingArtDirection}
                            onSelectPreset={applyStylePreset}
                            onStyleNameChange={setStyleName}
                            onPositivePromptChange={setPositivePrompt}
                            onNegativePromptChange={setNegativePrompt}
                            onSave={saveArtDirection}
                        />
                    ) : activeStep === "cast" ? (
                        <CastStep
                            episode={episode}
                            assets={assets}
                            generating={generatingCast}
                            styleReady={Boolean(readArtDirectionDraft(episode))}
                            imageModelReady={isAiConfigReady(config, imageModel)}
                            onGenerateMissing={() => void generateMissingCastReferences()}
                            onOpenWorkbench={(kind, entityId) => setWorkbenchTarget({ kind, entityId })}
                        />
                    ) : activeStep === "storyboard_r2v" ? (
                        <StoryboardStep episode={episode} onJumpToScript={() => setActiveStep("script")} onOpenWorkbench={setShotWorkbenchId} />
                    ) : (
                        <ComingStep step={steps.find((step) => step.id === activeStep)} episode={episode} />
                    )}
                </section>
                <StudioModelSettingsModal
                    open={modelSettingsOpen}
                    saving={savingModelSettings}
                    draft={modelDraft}
                    config={config}
                    onDraftChange={setModelDraft}
                    onOpenGlobalConfig={() => {
                        setModelSettingsOpen(false);
                        openConfigDialog(true);
                    }}
                    onCancel={() => setModelSettingsOpen(false)}
                    onSave={saveModelSettings}
                />
                <CastWorkbenchModal
                    open={Boolean(workbenchTarget)}
                    kind={workbenchTarget?.kind ?? null}
                    entityId={workbenchTarget?.entityId ?? null}
                    episode={episode}
                    assets={assets}
                    generating={generatingCast}
                    imageModelReady={isAiConfigReady(config, imageModel)}
                    onGenerate={(kind, entityId, prompt, count) => void generateWorkbenchCastReferences(kind, entityId, prompt, count)}
                    onSavePrompt={(kind, entityId, prompt) => void saveWorkbenchPrompt(kind, entityId, prompt)}
                    onSelectReference={(kind, entityId, assetId) => void selectWorkbenchReference(kind, entityId, assetId)}
                    onRemoveCandidate={(kind, entityId, assetId) => void removeWorkbenchCandidate(kind, entityId, assetId)}
                    onAddLibraryAsset={(kind, entityId, asset, role) => void addWorkbenchLibraryAsset(kind, entityId, asset, role)}
                    onClose={() => setWorkbenchTarget(null)}
                />
                <ShotWorkbenchModal
                    open={Boolean(shotWorkbenchId)}
                    shotId={shotWorkbenchId}
                    episode={episode}
                    assets={assets}
                    generating={generatingShot}
                    imageModelReady={isAiConfigReady(config, imageModel)}
                    onSavePrompt={(shotId, prompt) => void saveShotWorkbenchPrompt(shotId, prompt)}
                    onSaveReferences={(shotId, references) => void saveShotWorkbenchReferences(shotId, references)}
                    onGenerate={(shotId, prompt, references, count, allowNoReferences) => void generateShotWorkbenchImages(shotId, prompt, references, count, allowNoReferences)}
                    onClose={() => setShotWorkbenchId(null)}
                />
            </main>
        </ConfigProvider>
    );
}

const studioAntTheme = {
    algorithm: antdTheme.darkAlgorithm,
    token: {
        colorBgBase: "#0c0b0e",
        colorBgContainer: "#181620",
        colorBgElevated: "#181620",
        colorBgLayout: "#0c0b0e",
        colorBorder: "rgba(255,255,255,0.06)",
        colorBorderSecondary: "rgba(255,255,255,0.035)",
        colorFillSecondary: "rgba(255,255,255,0.045)",
        colorPrimary: "#34d8c4",
        colorPrimaryHover: "#5ee9d6",
        colorText: "#f2ede4",
        colorTextSecondary: "#a8a2b0",
        colorTextTertiary: "#8b8597",
        borderRadius: 8,
        fontFamily: "var(--font-sans)",
    },
    components: {
        Button: {
            defaultBg: "rgba(255,255,255,0.045)",
            defaultBorderColor: "rgba(255,255,255,0.06)",
            defaultColor: "#f2ede4",
            primaryColor: "#0c0b0e",
            primaryShadow: "0 0 0 1px rgba(52,216,196,0.30), 0 0 24px -6px rgba(52,216,196,0.45)",
        },
        Input: {
            activeBorderColor: "#34d8c4",
            hoverBorderColor: "rgba(255,255,255,0.14)",
        },
        Tag: {
            defaultBg: "rgba(255,255,255,0.045)",
            defaultColor: "#a8a2b0",
        },
    },
};

const studioPrimaryButtonClass =
    "!inline-flex !items-center !justify-center !rounded-full !border-[#34d8c4]/65 !bg-[#34d8c4] !font-semibold !text-[#0c0b0e] !shadow-[inset_0_1.5px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(24,120,110,0.35),0_4px_14px_-2px_rgba(52,216,196,0.45)] hover:!bg-[#5ee9d6] disabled:!opacity-50";

const studioSecondaryButtonClass =
    "!inline-flex !items-center !justify-center !rounded-full !border-[#34d8c4]/40 !bg-[#34d8c4]/10 !font-semibold !text-[#34d8c4] !shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:!border-[#34d8c4]/60 hover:!bg-[#34d8c4]/20 hover:!text-[#f2ede4] disabled:!opacity-50";

function PipelineRail({
    series,
    episode,
    steps,
    modelSummary,
    activeStep,
    onBack,
    onStepChange,
    onOpenModelSettings,
}: {
    series: StudioSeries;
    episode: StudioEpisode;
    steps: StudioPipelineStep[];
    modelSummary: ReturnType<typeof buildStudioModelSummary>;
    activeStep: StudioPipelineStep["id"];
    onBack: () => void;
    onStepChange: (stepId: StudioPipelineStep["id"]) => void;
    onOpenModelSettings: () => void;
}) {
    return (
        <aside className="relative z-20 flex h-full w-[272px] shrink-0 flex-col border-r border-[rgba(255,255,255,0.06)] bg-[#0a090c]/95 backdrop-blur-xl">
            <div className="border-b border-[rgba(255,255,255,0.06)] px-5 py-[22px]">
                <button className="mb-5 inline-flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-[#8b8597] transition hover:text-[#f2ede4]" onClick={onBack}>
                    <ArrowLeft className="size-3.5" />
                    项目库
                </button>
                <p className="font-mono text-[0.59375rem] uppercase tracking-[0.22em] text-[#8b8597]">LumenX Studio</p>
                <h1 className="mt-2 line-clamp-2 text-[1.55rem] font-semibold leading-[1.08] text-[#f2ede4]">{series.title}</h1>
                <p className="mt-2 truncate text-[0.8125rem] text-[#a8a2b0]">{episode.title}</p>
            </div>
            <nav className="flex-1 space-y-1.5 overflow-y-auto p-3.5">
                {steps.map((step, index) => (
                    <button
                        key={step.id}
                        className={cn(
                            "relative flex w-full items-center gap-3 overflow-hidden rounded-lg border px-3.5 py-3 text-left transition-colors",
                            activeStep === step.id
                                ? "border-[#34d8c4]/40 bg-[#34d8c4]/10 text-[#34d8c4] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                                : "border-transparent text-[#a8a2b0] hover:border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.045)] hover:text-[#f2ede4]",
                            step.status === "gated" && activeStep !== step.id ? "opacity-55" : "",
                        )}
                        onClick={() => onStepChange(step.id)}
                    >
                        {index < steps.length - 1 ? <span className="absolute bottom-[-10px] left-[26px] top-[39px] w-px bg-[rgba(255,255,255,0.06)]" /> : null}
                        <span className="relative grid size-7 shrink-0 place-items-center rounded-full border border-[rgba(255,255,255,0.06)] bg-[#181620]">{step.icon}</span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{step.label}</span>
                            <span className="mt-0.5 block truncate font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[#8b8597]">{step.statusLabel}</span>
                        </span>
                        {activeStep === step.id ? <ChevronRight className="size-4 shrink-0 opacity-70" /> : <StepStateIcon status={step.status} />}
                    </button>
                ))}
            </nav>
            <div className="border-t border-[rgba(255,255,255,0.06)] p-4">
                <button
                    className="group w-full rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.045)] p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[#34d8c4]/35 hover:bg-[#34d8c4]/10"
                    onClick={onOpenModelSettings}
                >
                    <span className="flex items-center justify-between gap-3">
                        <span>
                            <span className="block font-mono text-[0.625rem] uppercase tracking-[0.16em] text-[#8b8597]">生成设置</span>
                            <span className="mt-1 block text-sm font-medium text-[#f2ede4]">项目模型偏好</span>
                        </span>
                        <span className="grid size-8 place-items-center rounded-full border border-[rgba(255,255,255,0.06)] bg-[#181620] text-[#8b8597] transition group-hover:border-[#34d8c4]/45 group-hover:text-[#34d8c4]">
                            <Settings2 className="size-4" />
                        </span>
                    </span>
                    <span className="mt-3 grid gap-1.5">
                        {modelSummary.map((item) => (
                            <span key={item.key} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 text-[0.75rem]">
                                <span className="text-[#8b8597]">{item.label}</span>
                                <span className={cn("truncate", item.source === "missing" ? "text-[#ffa94d]" : "text-[#f2ede4]")}>{item.value}</span>
                                <span className={cn("font-mono text-[0.5625rem] uppercase tracking-[0.12em]", item.source === "project" ? "text-[#34d8c4]" : "text-[#8b8597]")}>
                                    {item.source === "project" ? "Studio" : item.source === "global" ? "Global" : "None"}
                                </span>
                            </span>
                        ))}
                    </span>
                </button>
            </div>
        </aside>
    );
}

function StudioModelSettingsModal({
    open,
    saving,
    draft,
    config,
    onDraftChange,
    onOpenGlobalConfig,
    onCancel,
    onSave,
}: {
    open: boolean;
    saving: boolean;
    draft: Record<StudioModelPreferenceKey, string>;
    config: AiConfig;
    onDraftChange: (draft: Record<StudioModelPreferenceKey, string>) => void;
    onOpenGlobalConfig: () => void;
    onCancel: () => void;
    onSave: () => void;
}) {
    const modelFields: Array<{
        key: StudioModelPreferenceKey;
        title: string;
        eyebrow: string;
        globalModel: string;
        options: string[];
    }> = [
        { key: "textModel", title: "文本模型", eyebrow: "SCRIPT / POLISH", globalModel: config.textModel || config.model, options: config.textModels },
        { key: "imageModel", title: "生图模型", eyebrow: "IMAGE", globalModel: config.imageModel, options: config.imageModels },
        { key: "videoModel", title: "视频模型", eyebrow: "VIDEO / R2V", globalModel: config.videoModel, options: config.videoModels },
    ];

    const updateDraft = (key: StudioModelPreferenceKey, value: string) => {
        onDraftChange({ ...draft, [key]: value });
    };

    return (
        <Modal
            open={open}
            title={null}
            footer={null}
            width={560}
            centered
            onCancel={onCancel}
            styles={{
                root: { overflow: "hidden" },
                body: { padding: 0, background: "#131116" },
            }}
        >
            <div className="bg-[#131116] text-[#f2ede4]">
                <div className="border-b border-[rgba(255,255,255,0.06)] bg-[#0a090c]/55 px-6 py-5">
                    <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-[#8b8597]">Studio Model Settings</p>
                    <h2 className="mt-2 text-xl font-semibold">生成设置</h2>
                    <p className="mt-2 text-sm leading-6 text-[#a8a2b0]">为当前 Studio 项目锁定文本、生图和视频模型；选择跟随全局时会使用应用配置里的默认模型。</p>
                </div>
                <div className="space-y-3 px-6 py-5">
                    {modelFields.map((field) => {
                        const options = buildModelSelectOptions(field.options, field.globalModel);
                        return (
                            <div key={field.key} className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#181620] p-4">
                                <div className="mb-3 flex items-start justify-between gap-4">
                                    <div>
                                        <p className="font-mono text-[0.59375rem] uppercase tracking-[0.16em] text-[#8b8597]">{field.eyebrow}</p>
                                        <h3 className="mt-1 text-sm font-semibold text-[#f2ede4]">{field.title}</h3>
                                    </div>
                                    <span className="max-w-[15rem] truncate rounded-full border border-[rgba(255,255,255,0.06)] bg-[#0a090c] px-3 py-1 font-mono text-[0.625rem] text-[#a8a2b0]">全局：{field.globalModel || "未配置"}</span>
                                </div>
                                <Select className="w-full" value={draft[field.key]} options={options} onChange={(value) => updateDraft(field.key, value)} popupMatchSelectWidth={false} />
                            </div>
                        );
                    })}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(255,255,255,0.06)] bg-[#0a090c]/45 px-6 py-4">
                    <Button className={studioSecondaryButtonClass} icon={<Settings2 className="size-4" />} onClick={onOpenGlobalConfig}>
                        全局配置
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button className="!rounded-full !border-[rgba(255,255,255,0.08)] !bg-transparent !text-[#a8a2b0] hover:!border-[rgba(255,255,255,0.16)] hover:!text-[#f2ede4]" onClick={onCancel}>
                            取消
                        </Button>
                        <Button className={studioPrimaryButtonClass} icon={<Save className="size-4" />} loading={saving} onClick={onSave}>
                            保存设置
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function buildModelSelectOptions(models: string[], globalModel: string) {
    const normalized = Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
    return [
        {
            label: `跟随全局配置${globalModel ? ` · ${globalModel}` : ""}`,
            value: FOLLOW_GLOBAL_MODEL_VALUE,
        },
        ...normalized.map((model) => ({ label: model, value: model })),
    ];
}

function StepStateIcon({ status }: { status: StudioPipelineStep["status"] }) {
    if (status === "ready") return <Check className="size-4 shrink-0 text-[#34d8c4]" />;
    if (status === "gated") return <Lock className="size-3.5 shrink-0 text-[#8b8597]" />;
    return <span className="size-2 shrink-0 rounded-full border border-[#8b8597]" />;
}

function ScriptProcessorStep({
    episode,
    script,
    parseError,
    parsing,
    saving,
    structureDraft,
    savingStructure,
    onScriptChange,
    onSaveScript,
    onParseScript,
    onStructureDraftChange,
    onSaveStructureDraft,
}: {
    episode: StudioEpisode;
    script: string;
    parseError: string;
    parsing: boolean;
    saving: boolean;
    structureDraft: string;
    savingStructure: boolean;
    onScriptChange: (value: string) => void;
    onSaveScript: () => void;
    onParseScript: () => void;
    onStructureDraftChange: (value: string) => void;
    onSaveStructureDraft: () => void;
}) {
    return (
        <div className="flex h-full w-full overflow-hidden">
            <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <StepPageHeader
                    stepNumber={1}
                    englishName="SCRIPT"
                    title="剧本处理"
                    subtitle="输入剧本，提取角色、场景、道具和第一版分镜草稿。"
                    pills={
                        <>
                            <StepPill label="字数" value={script.trim().length} />
                            <StepPill label="分镜" value={episode.shots.length} />
                        </>
                    }
                    trailing={
                        <>
                            <Button className={studioSecondaryButtonClass} icon={<Save className="size-4" />} loading={saving} onClick={onSaveScript}>
                                保存
                            </Button>
                            <Button className={studioPrimaryButtonClass} type="primary" icon={<WandSparkles className="size-4" />} loading={parsing} onClick={onParseScript}>
                                提取实体
                            </Button>
                        </>
                    }
                />
                <div className="min-h-0 flex-1 overflow-hidden bg-[#131116] p-6">
                    {parseError ? <Alert className="mb-4" showIcon type="warning" title="剧本解析没有写入结果" description={parseError} /> : null}
                    <Input.TextArea
                        className="!h-full !resize-none !border-0 !bg-transparent !p-0 !font-mono !text-base !leading-8 !text-[#d8d0c4] shadow-none focus:!shadow-none"
                        value={script}
                        placeholder="输入短漫剧剧本。这里对应 LumenX ScriptProcessor 的主编辑区。"
                        spellCheck={false}
                        onChange={(event) => onScriptChange(event.target.value)}
                    />
                </div>
            </section>
            <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-[rgba(255,255,255,0.06)] bg-[#181620]/95">
                <SidePanelHeader title="结构草稿" subtitle="实体识别结果与可编辑 JSON" trailing={<Tag color="default">{episode.characters.length + episode.scenes.length + episode.props.length}</Tag>} />
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    <EntityList title="角色" items={episode.characters} emptyText="提取后会出现角色草稿。" />
                    <EntityList title="场景" items={episode.scenes} emptyText="提取后会出现主要场景。" />
                    <EntityList title="道具" items={episode.props} emptyText="提取后会出现关键道具。" />
                    <ShotList shots={episode.shots} />
                    <section className="space-y-3 border-t border-[rgba(255,255,255,0.06)] pt-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold text-[#f2ede4]">JSON 草稿</h3>
                                <p className="mt-1 text-xs text-[#8b8597]">保存后写回当前 Episode。</p>
                            </div>
                            <Button className={studioSecondaryButtonClass} size="small" loading={savingStructure} onClick={onSaveStructureDraft}>
                                保存
                            </Button>
                        </div>
                        <Input.TextArea className="!font-mono !text-xs" value={structureDraft} autoSize={{ minRows: 9, maxRows: 16 }} spellCheck={false} onChange={(event) => onStructureDraftChange(event.target.value)} />
                    </section>
                </div>
            </aside>
        </div>
    );
}

function ArtDirectionStep({
    episode,
    selectedStyleId,
    styleName,
    positivePrompt,
    negativePrompt,
    saving,
    onSelectPreset,
    onStyleNameChange,
    onPositivePromptChange,
    onNegativePromptChange,
    onSave,
}: {
    episode: StudioEpisode;
    selectedStyleId: string;
    styleName: string;
    positivePrompt: string;
    negativePrompt: string;
    saving: boolean;
    onSelectPreset: (preset: StudioStylePreset) => void;
    onStyleNameChange: (value: string) => void;
    onPositivePromptChange: (value: string) => void;
    onNegativePromptChange: (value: string) => void;
    onSave: () => void;
}) {
    const savedDraft = readArtDirectionDraft(episode);
    const selectedPreset = STUDIO_STYLE_PRESETS.find((preset) => preset.id === selectedStyleId) ?? STUDIO_STYLE_PRESETS[0];
    const recommendations = STUDIO_STYLE_PRESETS.slice(0, 2);
    const categories = [
        { id: "all", label: "全部" },
        { id: "cinematic", label: "电影" },
        { id: "anime", label: "动画" },
        { id: "ink", label: "水墨" },
        { id: "editorial", label: "图形" },
    ];
    const [activeCategory, setActiveCategory] = useState("all");
    const visiblePresets = activeCategory === "all" ? STUDIO_STYLE_PRESETS : STUDIO_STYLE_PRESETS.filter((preset) => preset.category === activeCategory);

    return (
        <div className="flex h-full w-full flex-col overflow-hidden">
            <StepPageHeader
                stepNumber={2}
                englishName="STYLE"
                title="美术方向"
                subtitle="选择或改写视觉风格，让后续角色、场景和分镜共用同一套美术语言。"
                pills={
                    <>
                        <StepPill label="当前" value={savedDraft?.name ?? "未保存"} />
                        <StepPill label="预设" value={STUDIO_STYLE_PRESETS.length} />
                    </>
                }
            />
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#131116] p-7">
                <section className="mb-7">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="flex items-center gap-2 text-lg font-semibold text-[#f2ede4]">
                            <Sparkles className="size-5 text-[#ffa94d]" />
                            推荐风格
                        </h3>
                        <Button className={studioSecondaryButtonClass} icon={<WandSparkles className="size-4" />} onClick={() => onSelectPreset(recommendations[0])}>
                            根据当前剧本推荐
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        {recommendations.map((preset) => (
                            <StylePresetCard key={preset.id} preset={preset} selected={selectedStyleId === preset.id} tone="recommendation" onSelect={() => onSelectPreset(preset)} />
                        ))}
                    </div>
                </section>

                <section className="mb-7">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#f2ede4]">
                        <Palette className="size-5 text-[#34d8c4]" />
                        内置预设
                    </h3>
                    <div className="mb-5 flex items-center gap-1.5 overflow-x-auto pb-1">
                        {categories.map((category) => (
                            <button
                                key={category.id}
                                className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                                    activeCategory === category.id ? "border-[#34d8c4]/40 bg-[#34d8c4]/15 text-[#34d8c4]" : "border-transparent bg-[rgba(255,255,255,0.06)] text-[#a8a2b0] hover:text-[#f2ede4]"
                                }`}
                                onClick={() => setActiveCategory(category.id)}
                            >
                                {category.label}
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
                        {visiblePresets.map((preset) => (
                            <StylePresetCard key={preset.id} preset={preset} selected={selectedStyleId === preset.id} onSelect={() => onSelectPreset(preset)} />
                        ))}
                    </div>
                </section>
            </div>
            <div className="grid shrink-0 grid-cols-1 gap-4 border-t border-[rgba(255,255,255,0.06)] bg-[#131116]/95 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,480px)]">
                <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase text-[#8b8597]">
                        <Pencil className="size-3.5" />
                        Prompt Editor
                    </div>
                    <Input value={styleName} onChange={(event) => onStyleNameChange(event.target.value)} className="mb-3" placeholder="风格名称" />
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <Input.TextArea value={positivePrompt} autoSize={{ minRows: 4, maxRows: 6 }} onChange={(event) => onPositivePromptChange(event.target.value)} placeholder="正向风格提示词" />
                        <Input.TextArea value={negativePrompt} autoSize={{ minRows: 4, maxRows: 6 }} onChange={(event) => onNegativePromptChange(event.target.value)} placeholder="负向提示词" />
                    </div>
                </div>
                <div className="flex min-w-0 flex-col justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.045)] p-4">
                    <div>
                        <p className="text-xs text-[#8b8597]">当前选择</p>
                        <h3 className="mt-2 text-xl font-semibold text-[#f2ede4]">{styleName || selectedPreset.name}</h3>
                        <p className="mt-2 text-sm leading-6 text-[#a8a2b0]">{selectedPreset.subtitle}</p>
                    </div>
                    <Button className={studioPrimaryButtonClass} type="primary" size="large" icon={<ChevronRight className="size-4" />} loading={saving} disabled={!positivePrompt.trim()} onClick={onSave}>
                        应用并继续
                    </Button>
                </div>
            </div>
        </div>
    );
}

function StylePresetCard({ preset, selected, tone, onSelect }: { preset: StudioStylePreset; selected: boolean; tone?: "recommendation"; onSelect: () => void }) {
    return (
        <button
            className={`group overflow-hidden rounded-lg border text-left transition ${
                selected ? "border-[#34d8c4]/70 bg-[#34d8c4]/10 shadow-[0_0_0_1px_rgba(52,216,196,0.18)]" : "border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.045)] hover:border-[rgba(255,255,255,0.16)] hover:bg-[rgba(255,255,255,0.075)]"
            }`}
            onClick={onSelect}
        >
            <div className="aspect-[4/2] p-3">
                <div className="flex h-full overflow-hidden rounded-md border border-[rgba(255,255,255,0.06)]">
                    {preset.swatches.map((color) => (
                        <span key={color} className="flex-1" style={{ backgroundColor: color }} />
                    ))}
                </div>
            </div>
            <div className="px-4 pb-4">
                <div className="flex items-center gap-2">
                    {tone ? <span className="rounded-md border border-[#ffa94d]/25 bg-[#ffa94d]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#ffa94d]">AI</span> : null}
                    <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-[#f2ede4]">{preset.name}</h4>
                    {selected ? <Check className="size-4 shrink-0 text-[#34d8c4]" /> : null}
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#8b8597]">{preset.subtitle}</p>
            </div>
        </button>
    );
}

function CastStep({
    episode,
    assets,
    generating,
    styleReady,
    imageModelReady,
    onGenerateMissing,
    onOpenWorkbench,
}: {
    episode: StudioEpisode;
    assets: Asset[];
    generating: boolean;
    styleReady: boolean;
    imageModelReady: boolean;
    onGenerateMissing: () => void;
    onOpenWorkbench: (kind: StudioCastTargetKind, entityId: string) => void;
}) {
    const sections = buildCastSections(episode);
    const total = sections.reduce((sum, section) => sum + section.items.length, 0);
    const readyCount = sections.reduce((sum, section) => sum + section.items.filter((item) => item.status === "ready").length, 0);
    const missingCount = sections.reduce((sum, section) => sum + section.items.filter((item) => !item.selectedAssetId && item.status !== "generating").length, 0);
    const [activeKind, setActiveKind] = useState<"all" | "character" | "scene" | "prop">("all");
    const visibleSections = activeKind === "all" ? sections : sections.filter((section) => section.kind === activeKind);
    const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
    const generateDisabledReason = !styleReady ? "先完成 Style 定调" : !imageModelReady ? "请先配置可用的图像模型" : !missingCount ? "参考图已生成" : "";

    return (
        <div className="flex h-full w-full flex-col overflow-hidden">
            <StepPageHeader
                stepNumber={3}
                englishName="CAST"
                title="本集素材"
                subtitle="从剧本解析出的角色、场景和道具生成本集素材清单，先作为 R2V 前的资产透视。"
                pills={
                    <>
                        <StepPill label="素材" value={total} />
                        <StepPill label="已有引用" value={readyCount} />
                    </>
                }
                trailing={
                    <Tooltip title={generateDisabledReason}>
                        <span>
                            <Button className={studioPrimaryButtonClass} type="primary" icon={<WandSparkles className="size-4" />} loading={generating} disabled={Boolean(generateDisabledReason) || generating} onClick={onGenerateMissing}>
                                生成缺失参考图
                            </Button>
                        </span>
                    </Tooltip>
                }
            />
            <div className="border-b border-[rgba(255,255,255,0.06)] bg-[#131116] px-6 pt-3">
                {[
                    { id: "all" as const, label: "全部", icon: <Layers className="size-3.5" />, count: total },
                    { id: "character" as const, label: "角色", icon: <Users className="size-3.5" />, count: sections[0].items.length },
                    { id: "scene" as const, label: "场景", icon: <MapPin className="size-3.5" />, count: sections[1].items.length },
                    { id: "prop" as const, label: "道具", icon: <Box className="size-3.5" />, count: sections[2].items.length },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        className={`relative mr-5 inline-flex items-center gap-1.5 pb-3 text-xs uppercase transition ${activeKind === tab.id ? "text-[#f2ede4]" : "text-[#8b8597] hover:text-[#f2ede4]"}`}
                        onClick={() => setActiveKind(tab.id)}
                    >
                        {tab.icon}
                        {tab.label}
                        <span className="text-[#34d8c4]">{tab.count}</span>
                        {activeKind === tab.id ? <span className="absolute inset-x-0 bottom-0 h-px bg-[#34d8c4]" /> : null}
                    </button>
                ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#131116] p-7">
                {total === 0 ? (
                    <EmptyStudioPanel icon={<Sparkles className="size-7" />} title="还没有本集素材" body="先在 Script 步骤提取角色、场景、道具，Cast 会自动汇总成本集资产清单。" />
                ) : (
                    <div className="space-y-8">
                        {visibleSections.map((section) => (
                            <section key={section.id}>
                                <h3 className="mb-4 text-lg font-semibold text-[#f2ede4]">{section.title}</h3>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {section.items.map((item) => (
                                        <CastAssetCard key={item.id} item={item} asset={item.selectedAssetId ? assetMap.get(item.selectedAssetId) : undefined} onOpen={() => onOpenWorkbench(item.kind, item.id)} />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function CastAssetCard({ item, asset, onOpen }: { item: ReturnType<typeof buildCastSections>[number]["items"][number]; asset?: Asset; onOpen: () => void }) {
    const selectedImage = asset ? getAssetCoverUrl(asset) : "";
    const statusTone = castStatusTone(item.status);
    return (
        <article
            className="group cursor-pointer rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.045)] p-4 transition hover:border-[#34d8c4]/35 hover:bg-[#34d8c4]/[0.07]"
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onOpen();
            }}
        >
            <div className="mb-4 flex aspect-[16/9] items-center justify-center overflow-hidden rounded-md border border-dashed border-[rgba(255,255,255,0.10)] bg-black/20 text-[#8b8597]">
                {selectedImage ? <img src={selectedImage} alt={item.name} className="h-full w-full object-cover" /> : <Image className="size-7" />}
            </div>
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <h4 className="truncate text-base font-semibold text-[#f2ede4]">{item.name}</h4>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#8b8597]">{item.description || "暂无描述"}</p>
                </div>
                <Tag color={statusTone.color}>{statusTone.label}</Tag>
            </div>
            <div className="mt-3 rounded-md border border-[rgba(255,255,255,0.06)] bg-[#0a090c]/70 p-3">
                <p className="font-mono text-[0.59375rem] uppercase tracking-[0.16em] text-[#8b8597]">Prompt</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#a8a2b0]">{item.prompt}</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#8b8597]">
                <span className="rounded-full border border-[rgba(255,255,255,0.06)] bg-[#0a090c] px-2.5 py-1">候选 {item.candidateCount}</span>
                <span className="rounded-full border border-[rgba(255,255,255,0.06)] bg-[#0a090c] px-2.5 py-1">出现 {item.appearances}</span>
            </div>
            {item.lastError ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#ffa94d]">最近失败：{item.lastError}</p> : null}
        </article>
    );
}

function castStatusTone(status: ReturnType<typeof buildCastSections>[number]["items"][number]["status"]) {
    if (status === "ready") return { label: "ready", color: "success" };
    if (status === "generating") return { label: "generating", color: "processing" };
    if (status === "failed") return { label: "failed", color: "error" };
    return { label: "pending", color: "warning" };
}

function findCastEntity(episode: StudioEpisode, kind: StudioCastTargetKind, entityId: string) {
    const pool = kind === "character" ? episode.characters : kind === "scene" ? episode.scenes : episode.props;
    return pool.find((entity) => entity.id === entityId);
}

function StoryboardStep({ episode, onJumpToScript, onOpenWorkbench }: { episode: StudioEpisode; onJumpToScript: () => void; onOpenWorkbench: (shotId: string) => void }) {
    const cards = buildStoryboardCards(episode);
    const canGenerate = episode.script.trim().length >= 40 && episode.characters.length > 0;

    return (
        <div className="flex h-full w-full flex-col overflow-hidden">
            <StepPageHeader
                stepNumber={4}
                englishName="STORYBOARD"
                title="分镜 R2V"
                subtitle="轻量迁移 LumenX StoryboardR2V：先承接分镜草稿、镜头 prompt 和生成前置检查。"
                pills={
                    <>
                        <StepPill label="镜头" value={cards.length} />
                        <StepPill label="对白" value={cards.filter((card) => card.hasDialogue).length} />
                    </>
                }
                trailing={
                    <Button className={studioPrimaryButtonClass} type="primary" icon={<WandSparkles className="size-4" />} disabled={!canGenerate}>
                        从剧本生成分镜
                    </Button>
                }
            />
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-[#131116] xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-h-0 overflow-y-auto p-7">
                    {cards.length === 0 ? (
                        <EmptyStudioPanel icon={<Clapperboard className="size-7" />} title="还没有分镜" body="Script 步骤提取后会生成第一版分镜草稿；这里会继续承接图像候选和 R2V 生成。" />
                    ) : (
                        <div className="space-y-4">
                            {cards.map((card) => (
                                <article
                                    key={card.id}
                                    className="group cursor-pointer rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.045)] p-4 transition hover:border-[#34d8c4]/35 hover:bg-[#34d8c4]/[0.07]"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onOpenWorkbench(card.id)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") onOpenWorkbench(card.id);
                                    }}
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#34d8c4]/25 bg-[#34d8c4]/10 text-sm font-semibold text-[#34d8c4]">{String(card.order).padStart(2, "0")}</div>
                                        <div className="min-w-0 flex-1">
                                            <div className="mb-2 flex items-center gap-2">
                                                <h3 className="text-base font-semibold text-[#f2ede4]">{card.title}</h3>
                                                {card.hasDialogue ? <Tag color="blue">对白</Tag> : null}
                                                <Tag color={card.hasReadyReferences ? "success" : card.hasExplicitReferences ? "warning" : "default"}>
                                                    {card.hasReadyReferences ? "引用 ready" : card.hasExplicitReferences ? `引用 ${card.referenceCount}` : "引用缺失"}
                                                </Tag>
                                                <Tag color="default">候选 {card.candidateCount}</Tag>
                                            </div>
                                            <p className="whitespace-pre-wrap text-sm leading-7 text-[#a8a2b0]">{card.prompt}</p>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
                <aside className="flex h-full flex-col border-t border-[rgba(255,255,255,0.06)] bg-[#181620]/95 xl:border-l xl:border-t-0">
                    <SidePanelHeader title="生成前检查" subtitle="对应 LumenX StoryboardGenerateDialog" trailing={<Film className="size-4 text-[#34d8c4]" />} />
                    <div className="space-y-3 p-4">
                        <PreflightRow passed={episode.script.trim().length >= 40} title="剧本文本足够长" hint="建议先在 Script 中保存完整剧本。" />
                        <PreflightRow passed={episode.characters.length > 0} title="已有角色清单" hint="先提取或手动保存 characters。" />
                        <PreflightRow passed={cards.length > 0} title="已有分镜草稿" hint="解析剧本后会写入 shotDrafts。" />
                        {!canGenerate ? (
                            <Button className={studioSecondaryButtonClass} block onClick={onJumpToScript}>
                                回到 Script 修正
                            </Button>
                        ) : null}
                    </div>
                </aside>
            </div>
        </div>
    );
}

function ShotWorkbenchModal({
    open,
    shotId,
    episode,
    assets,
    generating,
    imageModelReady,
    onSavePrompt,
    onSaveReferences,
    onGenerate,
    onClose,
}: {
    open: boolean;
    shotId: string | null;
    episode: StudioEpisode;
    assets: Asset[];
    generating: boolean;
    imageModelReady: boolean;
    onSavePrompt: (shotId: string, prompt: string) => void;
    onSaveReferences: (shotId: string, references: StudioShotReferences) => void;
    onGenerate: (shotId: string, prompt: string, references: StudioShotReferences, count: 1 | 2 | 4, allowNoReferences: boolean) => void;
    onClose: () => void;
}) {
    const shot = useMemo(() => (shotId ? episode.shots.find((item) => item.id === shotId) : null), [episode.shots, shotId]);
    const style = readArtDirectionDraft(episode);
    const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<StudioShotReferences>({ characterIds: [], sceneIds: [], propIds: [] });
    const [count, setCount] = useState<1 | 2 | 4>(1);
    const [allowNoReferences, setAllowNoReferences] = useState(false);

    useEffect(() => {
        if (!open || !shot) return;
        setPrompt(shot.prompt || buildShotPromptFallback(shot));
        setReferences(readShotReferences(shot));
        setCount(1);
        setAllowNoReferences(false);
    }, [open, shot]);

    if (!shotId || !shot) return null;

    const readyReferences = collectReadyShotReferenceAssets(episode, references, assetMap);
    const explicitReferenceCount = references.characterIds.length + references.sceneIds.length + references.propIds.length;
    const effectivePrompt = prompt.trim() ? `${prompt.trim()}${style?.positivePrompt ? `\n\nStyle baseline:\n${style.positivePrompt}` : ""}` : "";
    const generateDisabled = generating || !prompt.trim() || !style || !imageModelReady || (!readyReferences.length && !allowNoReferences);

    return (
        <Modal
            open={open}
            title={null}
            footer={null}
            width={1120}
            centered
            destroyOnHidden
            onCancel={onClose}
            styles={{
                body: { padding: 0, background: "#131116" },
            }}
        >
            <div className="bg-[#131116] text-[#f2ede4]">
                <header className="flex items-start gap-4 border-b border-[rgba(255,255,255,0.06)] bg-[#0a090c]/75 px-6 py-5">
                    <div className="grid size-10 shrink-0 place-items-center rounded-full border border-[#34d8c4]/35 bg-[#34d8c4]/10 text-[#34d8c4]">
                        <Clapperboard className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-[#8b8597]">Shot Workbench</p>
                        <h2 className="mt-1 truncate text-2xl font-semibold text-[#f2ede4]">
                            {String(shot.order).padStart(2, "0")} · {shot.title}
                        </h2>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#a8a2b0]">{shot.description}</p>
                    </div>
                    <Tag color={readyReferences.length ? "success" : explicitReferenceCount ? "warning" : "default"}>{readyReferences.length ? `${readyReferences.length} refs ready` : explicitReferenceCount ? "refs missing image" : "no refs"}</Tag>
                </header>

                <div className="grid max-h-[76vh] grid-cols-1 overflow-hidden xl:grid-cols-[300px_minmax(0,1fr)_300px]">
                    <aside className="min-h-0 space-y-4 overflow-y-auto border-b border-[rgba(255,255,255,0.06)] bg-[#181620]/70 p-5 xl:border-b-0 xl:border-r">
                        <section className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0a090c]/70 p-4">
                            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#f2ede4]">
                                <Palette className="size-4 text-[#34d8c4]" />
                                Style baseline
                            </div>
                            <p className="text-sm text-[#f2ede4]">{style?.name || "未保存"}</p>
                            <p className="mt-2 line-clamp-4 text-xs leading-5 text-[#a8a2b0]">{style?.positivePrompt || "请先在 Style 步骤保存视觉风格。"}</p>
                        </section>
                        <section>
                            <p className="mb-2 font-mono text-[0.59375rem] uppercase tracking-[0.16em] text-[#8b8597]">Cast selected refs</p>
                            {readyReferences.length ? (
                                <div className="grid grid-cols-2 gap-2">
                                    {readyReferences.map(({ id, label, asset }) => (
                                        <div key={`${label}-${id}`} className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0a090c]/75">
                                            <div className="flex aspect-[4/3] items-center justify-center bg-black/25 text-[#8b8597]">
                                                <img src={getAssetCoverUrl(asset)} alt={label} className="h-full w-full object-cover" />
                                            </div>
                                            <p className="truncate px-2 py-1.5 text-xs text-[#a8a2b0]">{label}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded-lg border border-dashed border-[#ffa94d]/25 bg-[#ffa94d]/10 p-4 text-sm leading-6 text-[#ffa94d]">当前镜头没有可用 Cast selected reference images。</div>
                            )}
                        </section>
                    </aside>

                    <section className="min-h-0 overflow-y-auto p-5">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="font-mono text-[0.59375rem] uppercase tracking-[0.16em] text-[#8b8597]">Prompt Editor</p>
                                <h3 className="mt-1 text-lg font-semibold text-[#f2ede4]">镜头 prompt</h3>
                            </div>
                            <Button
                                className="!rounded-full !border-[rgba(255,255,255,0.08)] !bg-[rgba(255,255,255,0.045)] !text-[#a8a2b0] hover:!border-[#34d8c4]/35 hover:!text-[#f2ede4]"
                                icon={<Save className="size-4" />}
                                onClick={() => onSavePrompt(shotId, prompt)}
                            >
                                保存 prompt
                            </Button>
                        </div>
                        <Input.TextArea className="!font-mono !text-sm !leading-6" value={prompt} autoSize={{ minRows: 8, maxRows: 12 }} spellCheck={false} onChange={(event) => setPrompt(event.target.value)} />

                        <section className="mt-4 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0a090c]/70 p-4">
                            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#f2ede4]">
                                <WandSparkles className="size-4 text-[#ffa94d]" />
                                Effective prompt preview
                            </div>
                            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-[#a8a2b0]">{effectivePrompt || "填写镜头 prompt 后预览最终生成提示词。"}</p>
                        </section>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.045)] p-4">
                            <div className="flex items-center gap-2">
                                {[1, 2, 4].map((value) => (
                                    <button
                                        key={value}
                                        className={cn(
                                            "grid size-9 place-items-center rounded-full border text-sm font-semibold transition",
                                            count === value ? "border-[#34d8c4]/60 bg-[#34d8c4]/15 text-[#34d8c4]" : "border-[rgba(255,255,255,0.08)] text-[#8b8597] hover:text-[#f2ede4]",
                                        )}
                                        onClick={() => setCount(value as 1 | 2 | 4)}
                                    >
                                        {value}
                                    </button>
                                ))}
                            </div>
                            <Button
                                className={studioPrimaryButtonClass}
                                type="primary"
                                icon={<WandSparkles className="size-4" />}
                                loading={generating}
                                disabled={generateDisabled}
                                onClick={() => onGenerate(shotId, prompt, references, count, allowNoReferences)}
                            >
                                生成候选
                            </Button>
                        </div>
                        <Checkbox className="mt-3 !text-[#a8a2b0]" checked={allowNoReferences} onChange={(event) => setAllowNoReferences(event.target.checked)}>
                            允许无参考生成
                        </Checkbox>
                        {!style ? <p className="mt-2 text-xs text-[#ffa94d]">请先保存 Style 定调后再生成。</p> : null}
                        {!imageModelReady ? <p className="mt-2 text-xs text-[#ffa94d]">请先配置可用的图像模型。</p> : null}
                        {!readyReferences.length && !allowNoReferences ? <p className="mt-2 text-xs text-[#ffa94d]">默认必须基于 Cast selected reference images；无参考生成需要显式勾选。</p> : null}
                    </section>

                    <aside className="min-h-0 overflow-y-auto border-t border-[rgba(255,255,255,0.06)] bg-[#181620]/70 p-5 xl:border-l xl:border-t-0">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <p className="font-mono text-[0.59375rem] uppercase tracking-[0.16em] text-[#8b8597]">References</p>
                                <h3 className="mt-1 text-lg font-semibold text-[#f2ede4]">显式引用</h3>
                            </div>
                            <Button className="!rounded-full" size="small" icon={<Save className="size-3.5" />} onClick={() => onSaveReferences(shotId, references)}>
                                保存
                            </Button>
                        </div>
                        <ReferenceSelect label="角色" value={references.characterIds} options={episode.characters.map((item) => ({ label: item.name, value: item.id }))} onChange={(characterIds) => setReferences({ ...references, characterIds })} />
                        <ReferenceSelect label="场景" value={references.sceneIds} options={episode.scenes.map((item) => ({ label: item.name, value: item.id }))} onChange={(sceneIds) => setReferences({ ...references, sceneIds })} />
                        <ReferenceSelect label="道具" value={references.propIds} options={episode.props.map((item) => ({ label: item.name, value: item.id }))} onChange={(propIds) => setReferences({ ...references, propIds })} />

                        <div className="mt-5">
                            <p className="mb-2 font-mono text-[0.59375rem] uppercase tracking-[0.16em] text-[#8b8597]">Gallery</p>
                            <div className="grid grid-cols-2 gap-2">
                                {shot.assetRefs
                                    .filter((ref) => ref.kind === "image" && (ref.role === "selected" || ref.role === "candidate"))
                                    .map((ref) => {
                                        const asset = assetMap.get(ref.assetId);
                                        const src = asset ? getAssetCoverUrl(asset) : "";
                                        return (
                                            <div key={`${ref.assetId}-${ref.role}`} className={cn("overflow-hidden rounded-lg border bg-[#0a090c]/75", ref.role === "selected" ? "border-[#34d8c4]/55" : "border-[rgba(255,255,255,0.06)]")}>
                                                <div className="relative flex aspect-[4/3] items-center justify-center bg-black/25 text-[#8b8597]">
                                                    {src ? <img src={src} alt="Storyboard candidate" className="h-full w-full object-cover" /> : <Image className="size-6" />}
                                                    {ref.role === "selected" ? <span className="absolute left-2 top-2 rounded-full bg-[#34d8c4] px-2 py-1 text-[0.625rem] font-semibold text-[#0c0b0e]">selected</span> : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                            {!shot.assetRefs.some((ref) => ref.kind === "image" && (ref.role === "selected" || ref.role === "candidate")) ? (
                                <div className="rounded-lg border border-dashed border-[rgba(255,255,255,0.10)] p-6 text-center text-sm text-[#8b8597]">还没有候选图</div>
                            ) : null}
                        </div>
                    </aside>
                </div>
            </div>
        </Modal>
    );
}

function ReferenceSelect({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ label: string; value: string }>; onChange: (value: string[]) => void }) {
    return (
        <label className="mb-4 block">
            <span className="mb-2 block text-xs font-medium text-[#a8a2b0]">{label}</span>
            <Select mode="multiple" className="w-full" value={value} options={options} placeholder={`选择${label}`} onChange={onChange} />
        </label>
    );
}

function readShotReferences(shot: StudioEpisode["shots"][number]): StudioShotReferences {
    return {
        characterIds: Array.isArray(shot.metadata?.references?.characterIds) ? shot.metadata.references.characterIds : [],
        sceneIds: Array.isArray(shot.metadata?.references?.sceneIds) ? shot.metadata.references.sceneIds : [],
        propIds: Array.isArray(shot.metadata?.references?.propIds) ? shot.metadata.references.propIds : [],
    };
}

function buildShotPromptFallback(shot: Pick<StudioEpisode["shots"][number], "description" | "dialogue">) {
    return [shot.description.trim(), shot.dialogue?.trim() ? `对白：${shot.dialogue.trim()}` : ""].filter(Boolean).join("\n");
}

function collectReadyShotReferenceAssets(episode: StudioEpisode, references: StudioShotReferences, assetMap: Map<string, Asset>) {
    const entities = [
        ...episode.characters.filter((item) => references.characterIds.includes(item.id)).map((item) => ({ id: item.id, label: item.name, ref: item.assetRefs.find((ref) => ref.kind === "image" && ref.role === "selected") })),
        ...episode.scenes.filter((item) => references.sceneIds.includes(item.id)).map((item) => ({ id: item.id, label: item.name, ref: item.assetRefs.find((ref) => ref.kind === "image" && ref.role === "selected") })),
        ...episode.props.filter((item) => references.propIds.includes(item.id)).map((item) => ({ id: item.id, label: item.name, ref: item.assetRefs.find((ref) => ref.kind === "image" && ref.role === "selected") })),
    ];
    return entities.flatMap((item) => {
        const asset = item.ref ? assetMap.get(item.ref.assetId) : undefined;
        return asset && asset.kind === "image" ? [{ id: item.id, label: item.label, asset }] : [];
    });
}

function PreflightRow({ passed, title, hint }: { passed: boolean; title: string; hint: string }) {
    return (
        <div className={cn("rounded-lg border px-3 py-2", passed ? "border-[#34d8c4]/25 bg-[#34d8c4]/10" : "border-[#ffa94d]/30 bg-[#ffa94d]/10")}>
            <div className="flex items-center gap-2 text-sm text-[#f2ede4]">
                <span className={cn("grid size-5 place-items-center rounded-full text-xs", passed ? "bg-[#34d8c4]/20 text-[#34d8c4]" : "bg-[#ffa94d]/20 text-[#ffa94d]")}>{passed ? "✓" : "!"}</span>
                {title}
            </div>
            {!passed ? <p className="mt-1 pl-7 text-xs text-[#8b8597]">{hint}</p> : null}
        </div>
    );
}

function EmptyStudioPanel({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
    return (
        <div className="flex h-full items-center justify-center text-center">
            <div className="max-w-md">
                <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.045)] text-[#8b8597] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">{icon}</div>
                <h3 className="text-xl font-semibold text-[#f2ede4]">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-[#8b8597]">{body}</p>
            </div>
        </div>
    );
}

function StepPageHeader({ stepNumber, englishName, title, subtitle, pills, trailing }: { stepNumber: number; englishName: string; title: string; subtitle: string; pills?: ReactNode; trailing?: ReactNode }) {
    return (
        <header className="shrink-0 border-b border-[rgba(255,255,255,0.035)] bg-[#131116]/95 px-7 pb-4 pt-[22px]">
            <div className="flex items-start gap-5">
                <div className="min-w-0 flex-1">
                    <p className="font-mono text-[0.59375rem] uppercase tracking-[0.22em] text-[#8b8597]">
                        STEP <span className="ml-1.5 font-medium text-[#34d8c4]">{String(stepNumber).padStart(2, "0")}</span> <span className="mx-1.5">·</span> {englishName}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-3.5">
                        <h2 className="text-[2.125rem] font-semibold leading-[1.05] tracking-normal text-[#f2ede4]">{title}</h2>
                        {pills ? <div className="flex flex-wrap items-center gap-2">{pills}</div> : null}
                    </div>
                    <p className="mt-1.5 text-[0.8125rem] text-[#a8a2b0]">{subtitle}</p>
                </div>
                {trailing ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-1">{trailing}</div> : null}
            </div>
        </header>
    );
}

function StepPill({ label, value }: { label: string; value: ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,255,255,0.06)] bg-[#0a090c] px-2.5 py-1 font-mono text-[0.59375rem] text-[#a8a2b0]">
            <span className="text-[#8b8597]">{label}</span>
            <span className="text-[#34d8c4]">{value}</span>
        </span>
    );
}

function SidePanelHeader({ title, subtitle, trailing }: { title: string; subtitle?: string; trailing?: ReactNode }) {
    return (
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[rgba(255,255,255,0.06)] bg-[#131116] px-4">
            <div className="grid size-7 shrink-0 place-items-center rounded-full border border-[#34d8c4]/30 bg-[#34d8c4]/10 text-[#34d8c4]">
                <WandSparkles className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-medium text-[#f2ede4]">{title}</h3>
                {subtitle ? <p className="truncate text-xs text-[#8b8597]">{subtitle}</p> : null}
            </div>
            {trailing}
        </div>
    );
}

function EntityList({ title, items, emptyText }: { title: string; items: Array<{ id: string; name: string; description: string }>; emptyText: string }) {
    return (
        <section className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.035)] p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#f2ede4]">
                {title}
                <Tag className="ml-auto" color="default">
                    {items.length}
                </Tag>
            </div>
            <List
                size="small"
                dataSource={items}
                locale={{ emptyText }}
                renderItem={(item) => (
                    <List.Item className="!border-[rgba(255,255,255,0.06)] !px-0">
                        <List.Item.Meta title={<span className="text-[#f2ede4]">{item.name}</span>} description={<span className="text-[#a8a2b0]">{item.description || "暂无描述"}</span>} />
                    </List.Item>
                )}
            />
        </section>
    );
}

function ShotList({ shots }: { shots: StudioEpisode["shots"] }) {
    return (
        <section className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.035)] p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#f2ede4]">
                分镜草稿
                <Tag className="ml-auto" color="default">
                    {shots.length}
                </Tag>
            </div>
            <List
                size="small"
                dataSource={shots}
                locale={{ emptyText: "提取后会出现按顺序排列的分镜草稿。" }}
                renderItem={(shot) => (
                    <List.Item className="!border-[rgba(255,255,255,0.06)] !px-0">
                        <List.Item.Meta
                            title={<span className="text-[#f2ede4]">{`${shot.order}. ${shot.title}`}</span>}
                            description={<span className="text-[#a8a2b0]">{shot.dialogue ? `${shot.description} 对白：${shot.dialogue}` : shot.description}</span>}
                        />
                    </List.Item>
                )}
            />
        </section>
    );
}

function ComingStep({ step, episode }: { step?: StudioPipelineStep; episode: StudioEpisode }) {
    return (
        <section className="flex h-full w-full flex-col overflow-hidden">
            <StepPageHeader
                stepNumber={step ? Number(step.label.slice(0, 1)) : 1}
                englishName={step?.label.split(". ")[1]?.toUpperCase() ?? "STUDIO"}
                title={step?.label.split(". ")[1] ?? "Studio"}
                subtitle="Issue 5 已完成 Script、Art Direction、Cast 和 StoryboardR2V 轻量版；Assembly 属于后续视频组装闭环。"
                pills={<StepPill label="镜头" value={episode.shots.length} />}
            />
            <div className="flex flex-1 items-center justify-center bg-[#131116] p-8">
                <div className="w-full max-w-xl rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.045)] p-6 text-center">
                    <p className="text-sm text-[#a8a2b0]">Assembly 已保留在 LumenX 统一 R2V 工作台中。</p>
                    <h2 className="mt-3 text-2xl font-semibold text-[#f2ede4]">{step?.label}</h2>
                    <p className="mt-3 text-sm leading-7 text-[#8b8597]">当前 Issue 5 范围已经收口；这个步骤会在后续“视频组装、混音和导出预览”切片里接入真实能力。</p>
                </div>
            </div>
        </section>
    );
}
