import { MANGE_BACKEND_WEB_URL } from "@/constant/env";

export type ToolHubTool = {
    key: "canvas" | "comic";
    title: string;
    description: string;
    href: string;
    actionLabel: string;
    status: "ready" | "soon";
};

export type MangeBackendWebLink = {
    key: "register" | "account" | "users" | "models" | "keys" | "credits" | "settings";
    label: string;
    href: string;
};

export const toolHubTools: ToolHubTool[] = [
    {
        key: "canvas",
        title: "无限画布",
        description: "整理素材、编排提示词、连接图片与文本节点，把一次灵感推进成可继续迭代的创作工程。",
        href: "/canvas",
        actionLabel: "进入画布",
        status: "ready",
    },
    {
        key: "comic",
        title: "AI 漫剧生成",
        description: "面向分镜、角色、旁白和连续镜头的生成流程，后续会作为独立工具开放。",
        href: "",
        actionLabel: "即将开放",
        status: "soon",
    },
];

export function createMangeBackendWebLinks(baseUrl = MANGE_BACKEND_WEB_URL): MangeBackendWebLink[] {
    const base = baseUrl.replace(/\/$/, "");
    return [
        { key: "register", label: "注册账号", href: `${base}/register` },
        { key: "account", label: "账号中心", href: `${base}/user` },
        { key: "users", label: "用户管理", href: `${base}/user` },
        { key: "models", label: "模型管理", href: `${base}/channel` },
        { key: "keys", label: "Key 管理", href: `${base}/token` },
        { key: "credits", label: "额度与用量", href: `${base}/user` },
        { key: "settings", label: "后台设置", href: `${base}/user` },
    ];
}
