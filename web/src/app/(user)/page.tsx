"use client";

import { Button, Tag } from "antd";
import { ArrowRight, CircleUserRound, Clapperboard, Coins, ExternalLink, KeyRound, Maximize2, Settings2, SlidersHorizontal, Sparkles, UserPlus, Users, type LucideIcon } from "lucide-react";

import { createMangeBackendWebLinks, toolHubTools, type MangeBackendWebLink, type ToolHubTool } from "@/lib/tool-hub";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/stores/use-user-store";

const backendLinks = createMangeBackendWebLinks();
const toolIcons = {
    canvas: Maximize2,
    comic: Clapperboard,
} satisfies Record<ToolHubTool["key"], LucideIcon>;
const backendLinkIcons = {
    register: UserPlus,
    account: CircleUserRound,
    users: Users,
    models: SlidersHorizontal,
    keys: KeyRound,
    credits: Coins,
    settings: Settings2,
} satisfies Record<MangeBackendWebLink["key"], LucideIcon>;

export default function IndexPage() {
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const isLoading = useUserStore((state) => state.isLoading);
    const relayReady = useUserStore((state) => state.relayReady);
    const userName = user?.displayName || user?.username || "创作者";

    if (!isReady || isLoading) {
        return <main className="flex h-full items-center justify-center bg-background text-sm text-stone-500 dark:text-stone-400">正在恢复登录状态...</main>;
    }

    if (!user) {
        return <main className="flex h-full items-center justify-center bg-background text-sm text-stone-500 dark:text-stone-400">正在进入登录页...</main>;
    }

    return (
        <main className="h-full overflow-y-auto bg-background text-stone-950 dark:text-stone-100">
            <section className="border-b border-stone-200 dark:border-stone-800">
                <div className="mx-auto grid min-h-[260px] max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[1fr_360px] lg:items-end">
                    <div className="max-w-3xl">
                        <Tag bordered={false} className="mb-5 bg-stone-100 text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                            {relayReady ? "云端 Relay 已就绪" : "云端 Relay 初始化中"}
                        </Tag>
                        <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">你好，{userName}</h1>
                        <p className="mt-5 max-w-2xl text-base leading-8 text-stone-500 dark:text-stone-400">这里是桌面端的 AI 工具入口。画布、本地素材和后续新增流程都从这里进入，账号与模型配置继续交给 mange-backend 网页端。</p>
                    </div>
                    <div className="grid gap-3 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <Sparkles className="size-4" />
                            当前账号
                        </div>
                        <div className="grid gap-2 text-sm text-stone-500 dark:text-stone-400">
                            <div className="flex items-center justify-between gap-4">
                                <span>用户名</span>
                                <span className="truncate text-stone-900 dark:text-stone-100">{user.username}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span>身份</span>
                                <span className="text-stone-900 dark:text-stone-100">{user.role === "admin" ? "管理员" : "用户"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span>算力点</span>
                                <span className="tabular-nums text-stone-900 dark:text-stone-100">{user.credits.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[1fr_360px]">
                <div>
                    <div className="mb-5 flex items-end justify-between gap-4">
                        <div>
                            <p className="text-xs text-stone-500">工具</p>
                            <h2 className="mt-2 text-2xl font-semibold">选择工作流</h2>
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        {toolHubTools.map((tool) => {
                            const Icon = toolIcons[tool.key];
                            const ready = tool.status === "ready";
                            return (
                                <article
                                    key={tool.key}
                                    className={cn(
                                        "flex min-h-[230px] flex-col justify-between rounded-lg border p-5",
                                        ready ? "border-stone-950 bg-stone-50 dark:border-stone-100 dark:bg-stone-950" : "border-stone-200 bg-transparent dark:border-stone-800",
                                    )}
                                >
                                    <div>
                                        <div className="mb-5 flex items-center justify-between gap-3">
                                            <span className="inline-flex size-10 items-center justify-center rounded-lg bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950">
                                                <Icon className="size-5" />
                                            </span>
                                            <Tag bordered={false} className={cn("m-0", ready ? "bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950" : "bg-stone-100 text-stone-500 dark:bg-stone-900 dark:text-stone-400")}>
                                                {ready ? "可用" : "即将开放"}
                                            </Tag>
                                        </div>
                                        <h3 className="text-xl font-semibold">{tool.title}</h3>
                                        <p className="mt-3 text-sm leading-7 text-stone-500 dark:text-stone-400">{tool.description}</p>
                                    </div>
                                    <Button type={ready ? "primary" : "default"} disabled={!ready} href={ready ? tool.href : undefined} icon={ready ? <ArrowRight className="size-4" /> : undefined} iconPlacement="end" className="mt-6 w-fit">
                                        {tool.actionLabel}
                                    </Button>
                                </article>
                            );
                        })}
                    </div>
                </div>

                <aside>
                    <div className="mb-5">
                        <p className="text-xs text-stone-500">mange-backend</p>
                        <h2 className="mt-2 text-2xl font-semibold">网页端入口</h2>
                    </div>
                    <div className="grid gap-3">
                        {backendLinks.map((link) => {
                            const Icon = backendLinkIcons[link.key];
                            return (
                                <a
                                    key={link.key}
                                    href={link.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex items-center justify-between gap-4 rounded-lg border border-stone-200 px-4 py-3 text-sm transition hover:border-stone-950 dark:border-stone-800 dark:hover:border-stone-100"
                                >
                                    <span className="flex min-w-0 items-center gap-3">
                                        <Icon className="size-4 shrink-0 text-stone-500 dark:text-stone-400" />
                                        <span className="truncate font-medium">{link.label}</span>
                                    </span>
                                    <ExternalLink className="size-4 shrink-0 text-stone-400 transition group-hover:text-stone-950 dark:group-hover:text-stone-100" />
                                </a>
                            );
                        })}
                    </div>
                </aside>
            </section>
        </main>
    );
}
