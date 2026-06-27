export type Prompt = {
    id: string;
    title: string;
    coverUrl: string;
    prompt: string;
    tags: string[];
    category: string;
    githubUrl: string;
    preview: string;
    createdAt: string;
    updatedAt: string;
};

export const ALL_PROMPTS_OPTION = "全部";

export const promptLibraryItems: Prompt[] = [
    {
        id: "prompt-character-sheet",
        title: "角色设定三视图",
        coverUrl: "/node-example/蓝衣将军三视图.png",
        prompt: "国风少年将军角色设定，正面、侧面、背面三视图，服装层次清晰，金属配件细节完整，纯净浅色背景，概念设计稿。",
        tags: ["角色设计", "三视图", "国风"],
        category: "角色",
        githubUrl: "",
        preview: "主体：蓝衣少年将军\n结构：正侧背三视图\n强调：服饰纹样、盔甲结构、武器挂点",
        createdAt: "2026-06-01T08:00:00.000Z",
        updatedAt: "2026-06-18T08:00:00.000Z",
    },
    {
        id: "prompt-character-red-general",
        title: "红衣将军海报",
        coverUrl: "/node-example/红衣将军三视图.png",
        prompt: "红衣古代将军站立于风中，披风大幅展开，电影海报构图，冷暖对比强烈，人物面部坚定，超清细节。",
        tags: ["角色设计", "海报", "电影感"],
        category: "角色",
        githubUrl: "",
        preview: "主体：红衣将军\n镜头：低机位仰拍\n氛围：史诗感、风场、强反差光",
        createdAt: "2026-06-02T08:00:00.000Z",
        updatedAt: "2026-06-20T08:00:00.000Z",
    },
    {
        id: "prompt-weapon-spear",
        title: "红缨枪产品特写",
        coverUrl: "/node-example/红缨枪.png",
        prompt: "古风红缨枪悬浮产品特写，枪尖金属反光锐利，枪杆木纹清晰，浅灰背景，电商级精修质感。",
        tags: ["道具", "产品图", "金属"],
        category: "道具",
        githubUrl: "",
        preview: "主体：红缨枪\n用途：电商展示\n强调：材质、边缘高光、干净背景",
        createdAt: "2026-06-03T08:00:00.000Z",
        updatedAt: "2026-06-19T08:00:00.000Z",
    },
    {
        id: "prompt-weapon-sword",
        title: "蓝宝剑展示页",
        coverUrl: "/node-example/蓝色的宝剑2.png",
        prompt: "蓝色宝剑置于博物馆级展示台，透明能量纹路环绕剑身，正面产品构图，材质高级，高清渲染。",
        tags: ["道具", "奇幻", "产品图"],
        category: "道具",
        githubUrl: "",
        preview: "主体：蓝色宝剑\n风格：奇幻道具设定\n强调：能量纹理、展示台、材质对比",
        createdAt: "2026-06-04T08:00:00.000Z",
        updatedAt: "2026-06-21T08:00:00.000Z",
    },
    {
        id: "prompt-scene-chat-room",
        title: "创作助手氛围场景",
        coverUrl: "/chat-preview.gif",
        prompt: "沉浸式创作工作台场景，屏幕漂浮对话气泡与图像缩略图，暖色灯光，未来感工作室，轻微景深。",
        tags: ["场景", "工作台", "未来感"],
        category: "场景",
        githubUrl: "",
        preview: "主体：创作工作台\n环境：工作室\n强调：屏幕光、UI 漂浮感、暖色氛围",
        createdAt: "2026-06-05T08:00:00.000Z",
        updatedAt: "2026-06-22T08:00:00.000Z",
    },
    {
        id: "prompt-scene-mountain-lake",
        title: "山湖写意插画",
        coverUrl: "/temp1.png",
        prompt: "薄雾山湖清晨，留白充足，东方写意插画风，层层山体由远及近，浅青与米白配色，宁静氛围。",
        tags: ["场景", "插画", "写意"],
        category: "场景",
        githubUrl: "",
        preview: "主体：山湖\n风格：东方写意插画\n强调：留白、雾气、低饱和配色",
        createdAt: "2026-06-06T08:00:00.000Z",
        updatedAt: "2026-06-23T08:00:00.000Z",
    },
    {
        id: "prompt-ui-tool-hub",
        title: "工具中心首页概念稿",
        coverUrl: "/image2.png",
        prompt: "创作工具中心首页 UI 概念稿，模块化卡片排布，中文标题，浅色工业设计语言，信息层级清晰，精致阴影。",
        tags: ["UI", "首页", "产品设计"],
        category: "界面",
        githubUrl: "",
        preview: "主体：工具中心首页\n风格：工业感浅色 UI\n强调：卡片分组、中文排版、层级",
        createdAt: "2026-06-07T08:00:00.000Z",
        updatedAt: "2026-06-24T08:00:00.000Z",
    },
    {
        id: "prompt-ui-dashboard",
        title: "数据看板模块",
        coverUrl: "/logo.svg",
        prompt: "桌面端数据看板界面，左侧导航、右侧指标卡片与趋势图，留白克制，重点指标使用青绿色强调。",
        tags: ["UI", "看板", "产品设计"],
        category: "界面",
        githubUrl: "",
        preview: "主体：桌面看板\n布局：导航 + 卡片 + 图表\n强调：清晰信息密度、轻量配色",
        createdAt: "2026-06-08T08:00:00.000Z",
        updatedAt: "2026-06-25T08:00:00.000Z",
    },
];

const promptDateFormatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });

export function formatPromptDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : promptDateFormatter.format(date);
}
