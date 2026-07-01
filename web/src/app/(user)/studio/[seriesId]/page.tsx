"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, App, Button, Input, List, Tag } from "antd";
import { ArrowLeft, Box, Clapperboard, Film, MapPinned, ScrollText, UserRound, WandSparkles } from "lucide-react";

import { normalizeScriptStructure, parseAndApplyScript, StudioGenerationError } from "@/services/api/studio-generation";
import { studioRepository, type StudioEpisode, type StudioSeries } from "@/services/studio-local";
import { useConfigStore } from "@/stores/use-config-store";

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
    const config = useConfigStore((state) => state.config);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);

    const episode = useMemo<StudioEpisode | null>(() => series?.episodes[0] ?? null, [series]);
    const textModel = series?.modelPreferences.textModel || config.textModel || config.model;

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
        <main className="h-full overflow-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[280px_1fr]">
                <aside className="space-y-5">
                    <Button icon={<ArrowLeft className="size-4" />} onClick={() => router.push("/studio")}>
                        项目库
                    </Button>
                    <div className="rounded-lg border border-stone-200 p-5 dark:border-stone-800">
                        <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950">
                            <Clapperboard className="size-5" />
                        </div>
                        <p className="text-xs text-stone-500">短漫剧项目</p>
                        <h1 className="mt-2 text-2xl font-semibold">{series.title}</h1>
                        <p className="mt-3 text-sm leading-7 text-stone-500 dark:text-stone-400">{series.summary || "当前 MVP 先固定单项目、单 Episode 01 工作流。"}</p>
                    </div>
                    <nav className="grid gap-2 text-sm">
                        <span className="rounded-lg bg-stone-950 px-4 py-3 font-medium text-white dark:bg-stone-100 dark:text-stone-950">{episode.title}</span>
                        <span className="rounded-lg border border-stone-200 px-4 py-3 text-stone-500 dark:border-stone-800 dark:text-stone-400">角色 / 场景 / 道具</span>
                        <span className="rounded-lg border border-stone-200 px-4 py-3 text-stone-500 dark:border-stone-800 dark:text-stone-400">分镜表</span>
                    </nav>
                </aside>

                <section className="min-w-0 space-y-6">
                    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800">
                        <div>
                            <p className="text-xs text-stone-500">Episode 01 工作台</p>
                            <h2 className="mt-3 text-3xl font-semibold">项目壳已就绪</h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button loading={saving} onClick={saveScript}>
                                保存剧本草稿
                            </Button>
                            <Button type="primary" icon={<WandSparkles className="size-4" />} loading={parsing} onClick={parseCurrentScript}>
                                解析剧本
                            </Button>
                        </div>
                    </header>

                    <div className="grid gap-4 md:grid-cols-4">
                        <Metric icon={<ScrollText className="size-4" />} label="剧本字数" value={String(script.trim().length)} />
                        <Metric icon={<UserRound className="size-4" />} label="角色" value={String(episode.characters.length)} />
                        <Metric icon={<Film className="size-4" />} label="分镜" value={String(episode.shots.length)} />
                        <Metric icon={<WandSparkles className="size-4" />} label="生成链路" value={episode.generation?.scriptParser ? "已接入" : "待解析"} />
                    </div>

                    <section className="grid gap-3">
                        <div>
                            <h3 className="text-lg font-semibold">剧本草稿</h3>
                            <p className="mt-2 text-sm leading-7 text-stone-500 dark:text-stone-400">输入剧本后可调用当前文本模型解析角色、场景、道具和分镜草稿；解析失败时仍可继续手动编辑本地项目。</p>
                        </div>
                        {parseError ? <Alert showIcon type="warning" title="剧本解析没有写入结果" description={parseError} /> : null}
                        <Input.TextArea value={script} placeholder="输入短漫剧剧本，后续会在这里发起 AI 剧本解析。" autoSize={{ minRows: 12, maxRows: 20 }} onChange={(event) => setScript(event.target.value)} />
                    </section>

                    <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                        <EntityList icon={<UserRound className="size-4" />} title="角色" items={episode.characters} emptyText="解析后会出现角色草稿，也可以后续手动补录。" />
                        <EntityList icon={<MapPinned className="size-4" />} title="场景" items={episode.scenes} emptyText="解析后会出现主要场景。" />
                        <EntityList icon={<Box className="size-4" />} title="道具" items={episode.props} emptyText="解析后会出现关键道具。" />
                        <ShotList shots={episode.shots} />
                    </section>

                    <section className="grid gap-3">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold">结构草稿 JSON</h3>
                                <p className="mt-2 text-sm leading-7 text-stone-500 dark:text-stone-400">可编辑 characters、scenes、props 和 shotDrafts，保存后写回当前 Episode。</p>
                            </div>
                            <Button loading={savingStructure} onClick={saveStructureDraft}>
                                保存结构草稿
                            </Button>
                        </div>
                        <Input.TextArea value={structureDraft} autoSize={{ minRows: 10, maxRows: 18 }} spellCheck={false} onChange={(event) => setStructureDraft(event.target.value)} />
                    </section>
                </section>
            </div>
        </main>
    );
}

function formatEpisodeStructure(episode: StudioEpisode | null) {
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

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
    return (
        <div className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
            <div className="flex items-center gap-2 text-xs text-stone-500">
                {icon}
                {label}
            </div>
            <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
        </div>
    );
}

function EntityList({ icon, title, items, emptyText }: { icon: ReactNode; title: string; items: Array<{ id: string; name: string; description: string }>; emptyText: string }) {
    return (
        <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                {icon}
                {title}
                <Tag className="ml-auto" color="default">
                    {items.length}
                </Tag>
            </div>
            <List
                dataSource={items}
                locale={{ emptyText }}
                renderItem={(item) => (
                    <List.Item className="!px-0">
                        <List.Item.Meta title={item.name} description={item.description || "暂无描述"} />
                    </List.Item>
                )}
            />
        </section>
    );
}

function ShotList({ shots }: { shots: StudioEpisode["shots"] }) {
    return (
        <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Film className="size-4" />
                分镜草稿
                <Tag className="ml-auto" color="default">
                    {shots.length}
                </Tag>
            </div>
            <List
                dataSource={shots}
                locale={{ emptyText: "解析后会出现按顺序排列的分镜草稿。" }}
                renderItem={(shot) => (
                    <List.Item className="!px-0">
                        <List.Item.Meta title={`${shot.order}. ${shot.title}`} description={shot.dialogue ? `${shot.description} 对白：${shot.dialogue}` : shot.description} />
                    </List.Item>
                )}
            />
        </section>
    );
}
