import axios from "axios";
import { nanoid } from "nanoid";
import { z } from "zod";

import { aiApiUrl, aiRequestHeaders, refreshRemoteUser } from "@/services/api/ai-request";
import type { StudioEpisodePatch, StudioShot, StudioCharacter, StudioProp, StudioScene, createStudioRepository, StudioEpisode, StudioSeries } from "@/services/studio-local";
import type { AiConfig } from "@/stores/use-config-store";

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

const parsedItemSchema = z.object({
    name: z.string().trim().min(1),
    description: z.string().trim().default(""),
});

const parsedShotSchema = z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    dialogue: z.string().trim().optional(),
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
        const response = await axios.post<{
            choices?: Array<{ message?: { content?: string } }>;
            error?: { message?: string };
            msg?: string;
        }>(
            aiApiUrl(config, "/chat/completions"),
            {
                model: config.textModel || config.model,
                messages,
                temperature: 0.2,
                response_format: { type: "json_object" },
            },
            {
                headers: await aiRequestHeaders(config, "application/json"),
                withCredentials: true,
            },
        );
        const content = response.data.choices?.[0]?.message?.content;
        if (!content) throw new StudioGenerationError(response.data.error?.message || response.data.msg || "剧本解析没有返回内容");
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

export function normalizeScriptStructure(payload: unknown): StudioScriptStructure {
    const validated = scriptParseSchema.safeParse(payload);
    if (!validated.success) {
        throw new StudioGenerationError("AI 返回内容无法识别为 Studio 剧本结构，请保留剧本并手动编辑或重新解析。", { cause: validated.error });
    }

    return {
        characters: validated.data.characters.map(toStudioCharacter),
        scenes: validated.data.scenes.map(toStudioScene),
        props: validated.data.props.map(toStudioProp),
        shots: validated.data.shotDrafts.map(toStudioShot),
    };
}

export async function parseAndApplyScript(input: ParseAndApplyScriptInput): Promise<ParseAndApplyScriptResult> {
    const parseResult = await parseScript(input);
    const result = await input.repository.updateEpisode(input.seriesId, input.episodeId, {
        script: input.script,
        characters: parseResult.characters,
        scenes: parseResult.scenes,
        props: parseResult.props,
        shots: parseResult.shots,
        generation: {
            scriptParser: {
                model: parseResult.model,
                status: "completed",
                parsedAt: new Date().toISOString(),
            },
        },
    });
    return { ...result, parseResult };
}

function buildScriptParseMessages(script: string): StudioChatMessage[] {
    return [
        {
            role: "system",
            content: [
                "你是短漫剧 Studio 的剧本解析器。",
                "只返回 JSON，不要返回 Markdown 或解释。",
                "JSON 字段必须是 characters、scenes、props、shotDrafts。",
                "characters/scenes/props 每项包含 name、description。",
                "shotDrafts 每项包含 title、description，可选 dialogue。",
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

function toStudioCharacter(item: z.infer<typeof parsedItemSchema>): StudioCharacter {
    return { id: nanoid(), name: item.name, description: item.description, assetRefs: [] };
}

function toStudioScene(item: z.infer<typeof parsedItemSchema>): StudioScene {
    return { id: nanoid(), name: item.name, description: item.description, assetRefs: [] };
}

function toStudioProp(item: z.infer<typeof parsedItemSchema>): StudioProp {
    return { id: nanoid(), name: item.name, description: item.description, assetRefs: [] };
}

function toStudioShot(item: z.infer<typeof parsedShotSchema>, index: number): StudioShot {
    return {
        id: nanoid(),
        title: item.title,
        order: index + 1,
        description: item.description,
        dialogue: item.dialogue,
        assetRefs: [],
    };
}
