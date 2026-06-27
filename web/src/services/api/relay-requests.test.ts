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
import { createVideoGenerationTask, pollVideoGenerationTask } from "@/services/api/video";
import type { AiConfig } from "@/stores/use-config-store";

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
            .mockResolvedValueOnce({ data: "data: {\"choices\":[{\"delta\":{\"content\":\"你好\"}}]}\n\n data: [DONE]\n\n" });

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
        expect((axiosMocks.post.mock.calls[0]?.[2] as { headers: Record<string, string> }).headers.Authorization).toBeUndefined();

        expect(axiosMocks.post).toHaveBeenNthCalledWith(
            2,
            "/api/canvas/relay/images/edits",
            expect.any(FormData),
            expect.objectContaining({
                headers: expect.objectContaining({ "New-Api-User": "42" }),
                withCredentials: true,
            }),
        );
        expect((axiosMocks.post.mock.calls[1]?.[2] as { headers: Record<string, string> }).headers.Authorization).toBeUndefined();

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
        expect((axiosMocks.post.mock.calls[2]?.[2] as { headers: Record<string, string> }).headers.Authorization).toBeUndefined();
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
        expect((axiosMocks.post.mock.calls[0]?.[2] as { headers: Record<string, string> }).headers.Authorization).toBeUndefined();
    });

    it("re-initializes relay and uses relay create/query/content routes for remote video requests", async () => {
        axiosMocks.post.mockResolvedValue({ data: { id: "task-1", status: "queued" } });
        axiosMocks.get
            .mockResolvedValueOnce({ data: { id: "task-1", status: "completed" } })
            .mockResolvedValueOnce({ data: new Blob(["video"], { type: "video/mp4" }) });

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
        expect((axiosMocks.post.mock.calls[0]?.[2] as { headers: Record<string, string> }).headers.Authorization).toBeUndefined();

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
        expect((axiosMocks.get.mock.calls[0]?.[1] as { headers: Record<string, string> }).headers.Authorization).toBeUndefined();
        expect((axiosMocks.get.mock.calls[1]?.[1] as { headers: Record<string, string> }).headers.Authorization).toBeUndefined();
    });
});
