"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { App, Button, Input } from "antd";
import { ArrowLeft, Clapperboard, Film, ScrollText, UserRound, WandSparkles } from "lucide-react";

import { studioRepository, type StudioEpisode, type StudioSeries } from "@/services/studio-local";

export default function StudioWorkspacePage() {
    const { message } = App.useApp();
    const router = useRouter();
    const params = useParams<{ seriesId: string }>();
    const [series, setSeries] = useState<StudioSeries | null>(null);
    const [hydrated, setHydrated] = useState(false);
    const [script, setScript] = useState("");
    const [saving, setSaving] = useState(false);

    const episode = useMemo<StudioEpisode | null>(() => series?.episodes[0] ?? null, [series]);

    useEffect(() => {
        async function loadSeries() {
            const nextSeries = await studioRepository.getSeries(params.seriesId);
            setSeries(nextSeries);
            setScript(nextSeries?.episodes[0]?.script ?? "");
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
            message.success("已保存剧本草稿");
        } finally {
            setSaving(false);
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
                        <Button type="primary" loading={saving} onClick={saveScript}>
                            保存剧本草稿
                        </Button>
                    </header>

                    <div className="grid gap-4 md:grid-cols-4">
                        <Metric icon={<ScrollText className="size-4" />} label="剧本字数" value={String(script.trim().length)} />
                        <Metric icon={<UserRound className="size-4" />} label="角色" value={String(episode.characters.length)} />
                        <Metric icon={<Film className="size-4" />} label="分镜" value={String(episode.shots.length)} />
                        <Metric icon={<WandSparkles className="size-4" />} label="生成链路" value="待接入" />
                    </div>

                    <section className="grid gap-3">
                        <div>
                            <h3 className="text-lg font-semibold">剧本草稿</h3>
                            <p className="mt-2 text-sm leading-7 text-stone-500 dark:text-stone-400">这里先保留可编辑文本区，后续 ScriptProcessor 会接入真实 relay 解析角色、场景、道具和分镜草稿。</p>
                        </div>
                        <Input.TextArea value={script} placeholder="输入短漫剧剧本，后续会在这里发起 AI 剧本解析。" autoSize={{ minRows: 12, maxRows: 20 }} onChange={(event) => setScript(event.target.value)} />
                    </section>
                </section>
            </div>
        </main>
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
