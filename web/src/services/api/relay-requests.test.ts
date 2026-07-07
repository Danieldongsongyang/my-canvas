import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMocks = vi.hoisted(() => ({
    post: vi.fn(),
    get: vi.fn(),
    isAxiosError: vi.fn().mockReturnValue(false),
}));

const authMocks = vi.hoisted(() => ({
    ensureCanvasRelayToken: vi.fn(),
    userAuthHeaders: vi.fn((userId?: string | number) => (userId ? { "New-Api-User": String(userId) } : {})),
}));

const userStoreMock = vi.hoisted(() => {
    let state = {
        user: { id: "42" },
        relayReady: false,
        hydrateUser: vi.fn(),
    };

    return {
        getState: vi.fn(() => state),
        setState: vi.fn((partial: Partial<typeof state>) => {
            state = { ...state, ...partial };
        }),
        reset(next?: Partial<typeof state>) {
            state = {
                user: { id: "42" },
                relayReady: false,
                hydrateUser: vi.fn(),
                ...next,
            };
        },
    };
});

vi.mock("axios", () => ({
    default: axiosMocks,
    ...axiosMocks,
}));

vi.mock("@/services/api/auth", () => ({
    ensureCanvasRelayToken: authMocks.ensureCanvasRelayToken,
    userAuthHeaders: authMocks.userAuthHeaders,
}));

vi.mock("@/stores/use-user-store", () => ({
    useUserStore: userStoreMock,
}));

vi.mock("@/services/image-storage", () => ({
    imageToDataUrl: vi.fn(async (image: { dataUrl?: string }) => image.dataUrl || "data:image/png;base64,AAA"),
}));

vi.mock("@/lib/image-utils", () => ({
    dataUrlToFile: vi.fn((image: { name?: string; type?: string; dataUrl: string }) => new File([image.dataUrl], image.name || "image.png", { type: image.type || "image/png" })),
}));

import { requestAudioGeneration } from "@/services/api/audio";
import { requestEdit, requestGeneration, requestImageQuestion } from "@/services/api/image";
import { requestStudioChatCompletion } from "@/services/api/studio-generation";
import { createVideoGenerationTask, pollVideoGenerationTask } from "@/services/api/video";
import type { AiConfig } from "@/stores/use-config-store";

type AxiosRequestOptions = {
    headers?: Record<string, string>;
};

const remoteConfig: AiConfig = {
    channelMode: "remote",
    baseUrl: "https://api.openai.com",
    apiKey: "sk-local",
    model: "gpt-5.5",
    imageModel: "gpt-image-1",
    videoModel: "sora-1",
    textModel: "gpt-5.5",
    audioModel: "gpt-4o-mini-tts",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    models: [],
    imageModels: [],
    videoModels: [],
    textModels: [],
    audioModels: [],
    quality: "auto",
    size: "1:1",
    count: "1",
    canvasImageCount: "3",
};

const remoteVideoConfig: AiConfig = {
    ...remoteConfig,
    model: "",
    videoModel: "sora-1",
};

function postHeaders(callIndex: number) {
    return requestHeaders(axiosMocks.post.mock.calls[callIndex]?.[2]);
}

function getHeaders(callIndex: number) {
    return requestHeaders(axiosMocks.get.mock.calls[callIndex]?.[1]);
}

function requestHeaders(options: unknown): Record<string, string> {
    return (options as AxiosRequestOptions | undefined)?.headers ?? {};
}

describe("relay-backed canvas api requests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        userStoreMock.reset();
        authMocks.ensureCanvasRelayToken.mockResolvedValue({ relay_ready: true });
        axiosMocks.post.mockReset();
        axiosMocks.get.mockReset();
    });

    it("re-initializes relay and uses canvas relay routes for remote image requests", async () => {
        axiosMocks.post
            .mockResolvedValueOnce({ data: { data: [{ b64_json: "AAA" }] } })
            .mockResolvedValueOnce({ data: { data: [{ b64_json: "BBB" }] } })
            .mockResolvedValueOnce({ data: 'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n data: [DONE]\n\n' });

        await requestGeneration(remoteConfig, "生成一张图");
        await requestEdit(remoteConfig, "改一下图片", [{ id: "ref-1", name: "ref.png", type: "image/png", dataUrl: "data:image/png;base64,AAA" }]);
        await requestImageQuestion(remoteConfig, [{ role: "user", content: "看图回答" }], () => undefined);

        expect(authMocks.ensureCanvasRelayToken).toHaveBeenCalledWith("42");
        expect(userStoreMock.setState).toHaveBeenCalledWith({ relayReady: true });

        expect(axiosMocks.post).toHaveBeenNthCalledWith(
            1,
            "/api/canvas/relay/images/generations",
            expect.any(Object),
            expect.objectContaining({
                headers: expect.objectContaining({ "New-Api-User": "42", "Content-Type": "application/json" }),
                withCredentials: true,
            }),
        );
        expect(postHeaders(0)).not.toHaveProperty("Authorization");

        expect(axiosMocks.post).toHaveBeenNthCalledWith(
            2,
            "/api/canvas/relay/images/edits",
            expect.any(FormData),
            expect.objectContaining({
                headers: expect.objectContaining({ "New-Api-User": "42" }),
                withCredentials: true,
            }),
        );
        expect(postHeaders(1)).not.toHaveProperty("Authorization");

        expect(axiosMocks.post).toHaveBeenNthCalledWith(
            3,
            "/api/canvas/relay/chat/completions",
            expect.objectContaining({ stream: true }),
            expect.objectContaining({
                headers: expect.objectContaining({ "New-Api-User": "42", "Content-Type": "application/json" }),
                withCredentials: true,
                responseType: "text",
            }),
        );
        expect(postHeaders(2)).not.toHaveProperty("Authorization");
    });

    it("clamps Dreamina image request counts to the provider limit", async () => {
        axiosMocks.post.mockResolvedValue({ data: { data: [{ b64_json: "AAA" }] } });
        const config = { ...remoteConfig, model: "dreamina-image-4.7", imageModel: "dreamina-image-4.7", count: "15" };

        await requestGeneration(config, "生成一张图");
        await requestEdit(config, "改一下图片", [{ id: "ref-1", name: "ref.png", type: "image/png", dataUrl: "data:image/png;base64,AAA" }]);

        expect(axiosMocks.post.mock.calls[0][1]).toEqual(expect.objectContaining({ n: 10 }));
        expect((axiosMocks.post.mock.calls[1][1] as FormData).get("n")).toBe("10");
    });

    it("re-initializes relay and keeps remote audio requests on canvas relay without bearer keys", async () => {
        axiosMocks.post.mockResolvedValue({ data: new Blob(["audio"], { type: "audio/mpeg" }) });

        await requestAudioGeneration(remoteConfig, "读一段话");

        expect(authMocks.ensureCanvasRelayToken).toHaveBeenCalledWith("42");
        expect(userStoreMock.setState).toHaveBeenCalledWith({ relayReady: true });
        expect(axiosMocks.post).toHaveBeenCalledWith(
            "/api/canvas/relay/audio/speech",
            expect.objectContaining({ input: "读一段话", model: "gpt-5.5" }),
            expect.objectContaining({
                headers: expect.objectContaining({ "New-Api-User": "42", "Content-Type": "application/json" }),
                responseType: "blob",
                withCredentials: true,
            }),
        );
        expect(postHeaders(0)).not.toHaveProperty("Authorization");
    });

    it("uses the current user relay route for Studio script parsing chat requests", async () => {
        axiosMocks.post.mockResolvedValue({ data: { choices: [{ message: { content: '{"shotDrafts":[{"title":"开场","description":"便利店亮灯"}]}' } }] } });

        const result = await requestStudioChatCompletion(remoteConfig, [
            { role: "system", content: "只返回 JSON" },
            { role: "user", content: "解析剧本" },
        ]);

        expect(result).toContain("shotDrafts");
        expect(authMocks.ensureCanvasRelayToken).toHaveBeenCalledWith("42");
        expect(userStoreMock.setState).toHaveBeenCalledWith({ relayReady: true });
        expect(axiosMocks.post).toHaveBeenCalledWith(
            "/api/canvas/relay/chat/completions",
            expect.objectContaining({
                model: "gpt-5.5",
                messages: expect.arrayContaining([expect.objectContaining({ content: "解析剧本" })]),
                response_format: { type: "json_object" },
            }),
            expect.objectContaining({
                headers: expect.objectContaining({ "New-Api-User": "42", "Content-Type": "application/json" }),
                withCredentials: true,
            }),
        );
        expect(postHeaders(0)).not.toHaveProperty("Authorization");
    });

    it("retries Studio script parsing without JSON mode when the relay rejects response_format", async () => {
        const unsupportedJsonModeError = {
            response: {
                data: {
                    error: {
                        message: "Unsupported parameter: response_format",
                    },
                },
            },
        };
        axiosMocks.isAxiosError.mockReturnValueOnce(true);
        axiosMocks.post.mockRejectedValueOnce(unsupportedJsonModeError).mockResolvedValueOnce({ data: { choices: [{ message: { content: '{"shotDrafts":[{"title":"开场","description":"便利店亮灯"}]}' } }] } });

        const result = await requestStudioChatCompletion(remoteConfig, [
            { role: "system", content: "只返回 JSON" },
            { role: "user", content: "解析剧本" },
        ]);

        expect(result).toContain("shotDrafts");
        expect(axiosMocks.post).toHaveBeenCalledTimes(2);
        expect(axiosMocks.post.mock.calls[0]?.[1]).toMatchObject({
            model: "gpt-5.5",
            response_format: { type: "json_object" },
        });
        expect(axiosMocks.post.mock.calls[1]?.[1]).toMatchObject({
            model: "gpt-5.5",
        });
        expect(axiosMocks.post.mock.calls[1]?.[1]).not.toHaveProperty("response_format");
        expect(postHeaders(1)).not.toHaveProperty("Authorization");
    });

    it("re-initializes relay and uses relay create/query/content routes for remote video requests", async () => {
        axiosMocks.post.mockResolvedValue({ data: { id: "task-1", status: "queued" } });
        axiosMocks.get.mockResolvedValueOnce({ data: { id: "task-1", status: "completed" } });
        axiosMocks.get.mockResolvedValueOnce({ data: new Blob(["video"], { type: "video/mp4" }) });

        const task = await createVideoGenerationTask(remoteVideoConfig, "生成视频");
        const state = await pollVideoGenerationTask(remoteVideoConfig, task);

        expect(state).toMatchObject({ status: "completed" });
        expect(authMocks.ensureCanvasRelayToken).toHaveBeenCalledWith("42");
        expect(userStoreMock.setState).toHaveBeenCalledWith({ relayReady: true });

        expect(axiosMocks.post).toHaveBeenCalledWith(
            "/api/canvas/relay/videos",
            expect.any(FormData),
            expect.objectContaining({
                headers: expect.objectContaining({ "New-Api-User": "42" }),
                withCredentials: true,
            }),
        );
        expect(postHeaders(0)).not.toHaveProperty("Authorization");

        expect(axiosMocks.get).toHaveBeenNthCalledWith(
            1,
            "/api/canvas/relay/videos/task-1",
            expect.objectContaining({
                headers: expect.objectContaining({ "New-Api-User": "42" }),
                params: { model: "sora-1" },
                withCredentials: true,
            }),
        );
        expect(axiosMocks.get).toHaveBeenNthCalledWith(
            2,
            "/api/canvas/relay/videos/task-1/content",
            expect.objectContaining({
                headers: expect.objectContaining({ "New-Api-User": "42" }),
                params: { model: "sora-1" },
                responseType: "blob",
                withCredentials: true,
            }),
        );
        expect(getHeaders(0)).not.toHaveProperty("Authorization");
        expect(getHeaders(1)).not.toHaveProperty("Authorization");
    });
});
