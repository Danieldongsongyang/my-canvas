"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Input, Modal } from "antd";
import { Clapperboard, FolderOpen, Plus, Trash2 } from "lucide-react";

import { studioRepository, type StudioSeries } from "@/services/studio-local";

export default function StudioPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const [hydrated, setHydrated] = useState(false);
    const [seriesList, setSeriesList] = useState<StudioSeries[]>([]);
    const [createOpen, setCreateOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [creating, setCreating] = useState(false);

    const loadSeries = async () => {
        setSeriesList(await studioRepository.listSeries());
        setHydrated(true);
    };

    useEffect(() => {
        void loadSeries();
    }, []);

    const createAndEnter = async () => {
        setCreating(true);
        try {
            const series = await studioRepository.createSeries({ title: title || `短漫剧项目 ${seriesList.length + 1}` });
            message.success("已创建 Studio 项目");
            router.push(`/studio/${series.id}`);
        } finally {
            setCreating(false);
        }
    };

    const deleteSeries = async (id: string) => {
        await studioRepository.deleteSeries(id);
        message.success("已删除 Studio 项目");
        await loadSeries();
    };

    return (
        <main className="h-full overflow-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800">
                    <div>
                        <p className="text-xs text-stone-500">Studio 项目库</p>
                        <h1 className="mt-3 text-3xl font-semibold">AI 漫剧生成</h1>
                        <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-500 dark:text-stone-400">从剧本、角色、场景和分镜组织一条短漫剧生产流程。当前阶段先建立项目壳和 Episode 01 工作台。</p>
                    </div>
                    <Button disabled={!hydrated} type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                        新建短漫剧
                    </Button>
                </header>

                {!hydrated ? (
                    <section className="flex min-h-[360px] items-center justify-center border-y border-stone-200 text-sm text-stone-500 dark:border-stone-800">正在加载 Studio 项目...</section>
                ) : seriesList.length ? (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {seriesList.map((series) => (
                            <article key={series.id} className="flex min-h-[230px] flex-col justify-between rounded-lg border border-stone-200 bg-stone-50 p-5 dark:border-stone-800 dark:bg-stone-950">
                                <div>
                                    <div className="mb-5 inline-flex size-10 items-center justify-center rounded-lg bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950">
                                        <Clapperboard className="size-5" />
                                    </div>
                                    <h2 className="line-clamp-2 text-xl font-semibold">{series.title}</h2>
                                    <p className="mt-3 text-sm leading-7 text-stone-500 dark:text-stone-400">{series.summary || "默认包含 Episode 01，可继续承载剧本解析、角色、场景和分镜模块。"}</p>
                                </div>
                                <div className="mt-6 flex items-center justify-between gap-2">
                                    <Button icon={<FolderOpen className="size-4" />} onClick={() => router.push(`/studio/${series.id}`)}>
                                        打开
                                    </Button>
                                    <Button danger type="text" icon={<Trash2 className="size-4" />} onClick={() => void deleteSeries(series.id)} aria-label={`删除 ${series.title}`} />
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <section className="flex min-h-[360px] flex-col items-center justify-center border-y border-stone-200 text-center dark:border-stone-800">
                        <Clapperboard className="size-10 text-stone-400" />
                        <h2 className="mt-5 text-xl font-medium">还没有短漫剧项目</h2>
                        <p className="mt-3 max-w-md text-sm leading-7 text-stone-500">新建后会自动生成 Episode 01，后续剧本解析、角色和分镜都会围绕这个项目组织。</p>
                        <Button type="primary" className="mt-6" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                            新建短漫剧
                        </Button>
                    </section>
                )}
            </div>

            <Modal title="新建短漫剧项目" open={createOpen} confirmLoading={creating} okText="创建并打开" cancelText="取消" onOk={createAndEnter} onCancel={() => setCreateOpen(false)}>
                <Input value={title} placeholder="例如：山海便利店" maxLength={40} showCount onChange={(event) => setTitle(event.target.value)} onPressEnter={() => void createAndEnter()} />
            </Modal>
        </main>
    );
}
