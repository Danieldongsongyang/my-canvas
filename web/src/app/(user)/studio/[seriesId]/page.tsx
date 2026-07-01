"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, App, Button, Input, List, Tag } from "antd";
import { ArrowLeft, Check, ChevronRight, Lock, Save, WandSparkles } from "lucide-react";

import { normalizeScriptStructure, parseAndApplyScript, StudioGenerationError } from "@/services/api/studio-generation";
import { studioRepository, type StudioEpisode, type StudioSeries } from "@/services/studio-local";
import { useConfigStore } from "@/stores/use-config-store";
import { buildStudioPipelineSteps, formatEpisodeStructure, type StudioPipelineStep } from "./studio-workspace-model";

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
    const config = useConfigStore((state) => state.config);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);

    const episode = useMemo<StudioEpisode | null>(() => series?.episodes[0] ?? null, [series]);
    const textModel = series?.modelPreferences.textModel || config.textModel || config.model;
    const steps = useMemo(() => (episode ? buildStudioPipelineSteps(episode) : []), [episode]);

    useEffect(() => {
        async function loadSeries() {
            const nextSeries = await studioRepository.getSeries(params.seriesId);
            setSeries(nextSeries);
            setScript(nextSeries?.episodes[0]?.script ?? "");
            setStructureDraft(formatEpisodeStructure(nextSeries?.episodes[0] ?? null));
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
            const structure = normalizeScriptStructure(JSON.parse(structureDraft));
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
        <main className="relative flex h-full w-full overflow-hidden bg-[#101113] text-[#f2eee7]">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:34px_34px]" />
            <PipelineRail series={series} episode={episode} steps={steps} activeStep={activeStep} onBack={() => router.push("/studio")} onStepChange={setActiveStep} />
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
                ) : (
                    <ComingStep step={steps.find((step) => step.id === activeStep)} episode={episode} />
                )}
            </section>
        </main>
    );
}

function PipelineRail({
    series,
    episode,
    steps,
    activeStep,
    onBack,
    onStepChange,
}: {
    series: StudioSeries;
    episode: StudioEpisode;
    steps: StudioPipelineStep[];
    activeStep: StudioPipelineStep["id"];
    onBack: () => void;
    onStepChange: (stepId: StudioPipelineStep["id"]) => void;
}) {
    return (
        <aside className="relative z-20 flex h-full w-64 shrink-0 flex-col border-r border-white/10 bg-[#17181b]/95 backdrop-blur-xl">
            <div className="border-b border-white/10 p-5">
                <button className="mb-4 inline-flex items-center gap-2 text-xs text-[#a9a39a] transition hover:text-[#f2eee7]" onClick={onBack}>
                    <ArrowLeft className="size-3.5" />
                    项目库
                </button>
                <p className="text-xs text-[#a9a39a]">LumenX Studio</p>
                <h1 className="mt-2 line-clamp-2 text-xl font-semibold leading-tight text-[#f2eee7]">{series.title}</h1>
                <p className="mt-2 text-xs text-[#7f796f]">{episode.title}</p>
            </div>
            <nav className="flex-1 space-y-2 overflow-y-auto p-4">
                {steps.map((step, index) => (
                    <button
                        key={step.id}
                        className={`relative flex w-full items-center gap-3 overflow-hidden rounded-lg px-4 py-3 text-left transition ${
                            activeStep === step.id ? "border border-[#49d2c6]/35 bg-[#49d2c6]/10 text-[#49d2c6]" : "border border-transparent text-[#aaa49c] hover:bg-white/[0.055] hover:text-[#f2eee7]"
                        } ${step.status === "gated" && activeStep !== step.id ? "opacity-55" : ""}`}
                        onClick={() => onStepChange(step.id)}
                    >
                        {index < steps.length - 1 ? <span className="absolute bottom-[-10px] left-[23px] top-[38px] w-px bg-white/10" /> : null}
                        <span className="relative grid size-7 shrink-0 place-items-center rounded-full border border-white/10 bg-black/20">{step.icon}</span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{step.label}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-[#7f796f]">{step.statusLabel}</span>
                        </span>
                        {activeStep === step.id ? <ChevronRight className="size-4 shrink-0 opacity-70" /> : <StepStateIcon status={step.status} />}
                    </button>
                ))}
            </nav>
            <div className="border-t border-white/10 p-4">
                <div className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
                    <p className="text-xs text-[#7f796f]">当前模型</p>
                    <p className="mt-1 truncate text-sm text-[#f2eee7]">{series.modelPreferences.textModel || "跟随全局配置"}</p>
                </div>
            </div>
        </aside>
    );
}

function StepStateIcon({ status }: { status: StudioPipelineStep["status"] }) {
    if (status === "ready") return <Check className="size-4 shrink-0 text-[#49d2c6]" />;
    if (status === "gated") return <Lock className="size-3.5 shrink-0 text-[#7f796f]" />;
    return <span className="size-2 shrink-0 rounded-full border border-[#7f796f]" />;
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
                            <Button icon={<Save className="size-4" />} loading={saving} onClick={onSaveScript}>
                                保存
                            </Button>
                            <Button type="primary" icon={<WandSparkles className="size-4" />} loading={parsing} onClick={onParseScript}>
                                提取实体
                            </Button>
                        </>
                    }
                />
                <div className="min-h-0 flex-1 overflow-hidden bg-[#141517] p-6">
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
            <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-white/10 bg-[#1b1b1f]/95">
                <SidePanelHeader title="结构草稿" subtitle="实体识别结果与可编辑 JSON" trailing={<Tag color="default">{episode.characters.length + episode.scenes.length + episode.props.length}</Tag>} />
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    <EntityList title="角色" items={episode.characters} emptyText="提取后会出现角色草稿。" />
                    <EntityList title="场景" items={episode.scenes} emptyText="提取后会出现主要场景。" />
                    <EntityList title="道具" items={episode.props} emptyText="提取后会出现关键道具。" />
                    <ShotList shots={episode.shots} />
                    <section className="space-y-3 border-t border-white/10 pt-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold text-[#f2eee7]">JSON 草稿</h3>
                                <p className="mt-1 text-xs text-[#8d867c]">保存后写回当前 Episode。</p>
                            </div>
                            <Button size="small" loading={savingStructure} onClick={onSaveStructureDraft}>
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

function StepPageHeader({ stepNumber, englishName, title, subtitle, pills, trailing }: { stepNumber: number; englishName: string; title: string; subtitle: string; pills?: ReactNode; trailing?: ReactNode }) {
    return (
        <header className="shrink-0 border-b border-white/10 bg-[#18191c]/90 px-7 py-5">
            <div className="flex items-start gap-5">
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase text-[#8d867c]">
                        STEP <span className="font-medium text-[#49d2c6]">{String(stepNumber).padStart(2, "0")}</span> · {englishName}
                    </p>
                    <div className="mt-2 flex flex-wrap items-baseline gap-3">
                        <h2 className="text-3xl font-semibold leading-tight text-[#f2eee7]">{title}</h2>
                        {pills ? <div className="flex flex-wrap items-center gap-2">{pills}</div> : null}
                    </div>
                    <p className="mt-2 text-sm text-[#aaa49c]">{subtitle}</p>
                </div>
                {trailing ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{trailing}</div> : null}
            </div>
        </header>
    );
}

function StepPill({ label, value }: { label: string; value: ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-xs text-[#aaa49c]">
            {label}
            <span className="text-[#49d2c6]">{value}</span>
        </span>
    );
}

function SidePanelHeader({ title, subtitle, trailing }: { title: string; subtitle?: string; trailing?: ReactNode }) {
    return (
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[#18191c] px-4">
            <div className="grid size-7 shrink-0 place-items-center rounded-full border border-[#49d2c6]/30 bg-[#49d2c6]/10 text-[#49d2c6]">
                <WandSparkles className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-medium text-[#f2eee7]">{title}</h3>
                {subtitle ? <p className="truncate text-xs text-[#8d867c]">{subtitle}</p> : null}
            </div>
            {trailing}
        </div>
    );
}

function EntityList({ title, items, emptyText }: { title: string; items: Array<{ id: string; name: string; description: string }>; emptyText: string }) {
    return (
        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#f2eee7]">
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
                    <List.Item className="!border-white/10 !px-0">
                        <List.Item.Meta title={<span className="text-[#f2eee7]">{item.name}</span>} description={<span className="text-[#9c9489]">{item.description || "暂无描述"}</span>} />
                    </List.Item>
                )}
            />
        </section>
    );
}

function ShotList({ shots }: { shots: StudioEpisode["shots"] }) {
    return (
        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#f2eee7]">
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
                    <List.Item className="!border-white/10 !px-0">
                        <List.Item.Meta
                            title={<span className="text-[#f2eee7]">{`${shot.order}. ${shot.title}`}</span>}
                            description={<span className="text-[#9c9489]">{shot.dialogue ? `${shot.description} 对白：${shot.dialogue}` : shot.description}</span>}
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
                subtitle="Issue 5 先固定 LumenX pipeline 空间结构，后续切片会逐步接入该步骤的真实组件。"
                pills={<StepPill label="镜头" value={episode.shots.length} />}
            />
            <div className="flex flex-1 items-center justify-center bg-[#141517] p-8">
                <div className="w-full max-w-xl rounded-lg border border-white/10 bg-white/[0.04] p-6 text-center">
                    <p className="text-sm text-[#aaa49c]">该步骤已占位在 LumenX 统一 R2V 工作台中。</p>
                    <h2 className="mt-3 text-2xl font-semibold text-[#f2eee7]">{step?.label}</h2>
                    <p className="mt-3 text-sm leading-7 text-[#8d867c]">下一轮会按 Issue 5 顺序继续迁移 Art Direction、Cast 和 StoryboardR2V 轻量版。</p>
                </div>
            </div>
        </section>
    );
}
