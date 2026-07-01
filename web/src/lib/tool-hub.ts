import { MANGE_BACKEND_WEB_URL } from "@/constant/env";

export type ToolHubTool = {
    key: "canvas" | "comic";
    title: string;
    description: string;
    href: string;
    actionLabel: string;
    status: "ready" | "soon";
};

const mangeBackendWebLinkTargets = [
    { key: "register", label: "注册账号", path: "/register" },
    { key: "account", label: "账号中心", path: "/user" },
    { key: "users", label: "用户管理", path: "/user" },
    { key: "models", label: "模型管理", path: "/channel" },
    { key: "keys", label: "Key 管理", path: "/token" },
    { key: "credits", label: "额度与用量", path: "/user" },
    { key: "settings", label: "后台设置", path: "/user" },
] as const;

export type MangeBackendWebLink = {
    key: (typeof mangeBackendWebLinkTargets)[number]["key"];
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
        description: "面向剧本、角色、场景和连续镜头的项目制短漫剧生产流程。",
        href: "/studio",
        actionLabel: "进入 Studio",
        status: "ready",
    },
];

export function createMangeBackendWebLinks(baseUrl = MANGE_BACKEND_WEB_URL): MangeBackendWebLink[] {
    const base = baseUrl.replace(/\/$/, "");
    return mangeBackendWebLinkTargets.map(({ key, label, path }) => ({ key, label, href: `${base}${path}` }));
}
