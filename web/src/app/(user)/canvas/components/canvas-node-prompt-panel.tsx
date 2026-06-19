"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, Camera, ChevronDown, LoaderCircle, PanelsTopLeft, Plus } from "lucide-react";
import { Button } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { defaultConfig, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

const canvasComposerCountOptions = [1, 2, 4];

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    mentionReferences?: CanvasResourceReference[];
    canGenerateFromConnectedInputs?: boolean;
    onImageSettingsOpenChange?: (open: boolean) => void;
};

export function CanvasNodePromptPanel({ node, isRunning, onPromptChange, onConfigChange, onGenerate, mentionReferences = [], canGenerateFromConnectedInputs = false, onImageSettingsOpenChange }: CanvasNodePromptPanelProps) {
    const globalConfig = useEffectiveConfig();
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = defaultMode(node.type);
    const config = buildNodeConfig(globalConfig, node, mode);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const isEditingExistingContent = hasTextContent || hasImageContent;
    const [prompt, setPrompt] = useState(isEditingExistingContent ? "" : node.metadata?.prompt || "");
    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: config.model, count: mode === "image" ? config.count : 1 });
    const canSubmit = Boolean(prompt.trim() || canGenerateFromConnectedInputs);
    const imageReferences = mentionReferences.filter((item) => item.kind === "image" && item.active);

    useEffect(() => {
        setPrompt(isEditingExistingContent ? "" : node.metadata?.prompt || "");
    }, [isEditingExistingContent, node.id]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        if (!isEditingExistingContent) onPromptChange(node.id, value);
    };

    const submit = () => {
        const text = prompt.trim();
        if (!text && !canGenerateFromConnectedInputs) return;
        if (isRunning) return;
        onGenerate(node.id, mode, text);
        setPrompt("");
    };

    return (
        <div
            data-canvas-no-zoom
            className="rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDownCapture={(event) => event.stopPropagation()}
            onMouseDownCapture={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            {mode === "image" && imageReferences.length ? <ReferenceStrip references={imageReferences} theme={theme} /> : null}
            <CanvasResourceMentionTextarea
                value={prompt}
                references={mentionReferences}
                onChange={updatePrompt}
                onSubmit={submit}
                className="thin-scrollbar h-24 w-full resize-none rounded-xl border px-3 py-2 text-sm leading-5 outline-none select-text"
                style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
                placeholder={promptPlaceholder(mode, hasImageContent, hasTextContent)}
            />

            <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                <div className="thin-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
                    <CanvasPromptLibrary onSelect={updatePrompt} />
                    {mode === "image" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="image" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, { [key]: value })}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                            <CanvasComposerToggle theme={theme} icon={<Camera className="size-3.5" />} label="摄影机控制" active={Boolean(node.metadata?.cameraControl)} onClick={() => onConfigChange(node.id, { cameraControl: !node.metadata?.cameraControl })} />
                            <CanvasComposerToggle theme={theme} icon={<PanelsTopLeft className="size-3.5" />} label="全景图" active={Boolean(node.metadata?.panorama)} onClick={() => onConfigChange(node.id, { panorama: !node.metadata?.panorama })} />
                            <CanvasComposerCount theme={theme} value={config.count} onChange={(count) => onConfigChange(node.id, { count })} />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="video" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasVideoSettingsPopover config={config} buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))} />
                        </>
                    ) : mode === "audio" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="audio" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasAudioSettingsPopover config={config} buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                        </>
                    ) : (
                        <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="text" onMissingConfig={() => openConfigDialog(true)} />
                    )}
                </div>
                <Button
                    type="primary"
                    className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3"
                    disabled={isRunning || !canSubmit}
                    onClick={submit}
                    aria-label="生成"
                >
                    <span className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums">
                            <CreditSymbol />
                            {credits.toLocaleString()}
                        </span>
                        {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                    </span>
                </Button>
            </div>
        </div>
    );
}

function ReferenceStrip({ references, theme }: { references: CanvasResourceReference[]; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="mb-3 flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
            {references.map((reference, index) => (
                <div key={reference.nodeId} className="flex h-24 w-[76px] shrink-0 flex-col overflow-hidden rounded-xl border" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                    <div className="relative h-[72px] flex-1 bg-white">
                        {reference.previewUrl ? <img src={reference.previewUrl} alt={reference.title} className="h-full w-full object-contain" /> : null}
                        <div className="absolute left-0 bottom-0 right-0 px-2 py-1 text-[11px] font-semibold" style={{ background: `${theme.toolbar.panel}cc`, color: theme.node.text }}>{`图片${index + 1}`}</div>
                    </div>
                    <div className="truncate px-2 py-1.5 text-[11px] opacity-80">{reference.title}</div>
                </div>
            ))}
            <div className="flex h-24 w-[76px] shrink-0 items-center justify-center rounded-xl border border-dashed opacity-70" style={{ borderColor: theme.node.stroke }}>
                <Plus className="size-5" />
            </div>
        </div>
    );
}

function CanvasComposerToggle({ theme, icon, label, active, onClick }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; icon: ReactNode; label: string; active?: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition hover:opacity-80"
            style={{ background: active ? theme.toolbar.activeBg : "transparent", borderColor: active ? theme.node.text : theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}

function CanvasComposerCount({ theme, value, onChange }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; value: string; onChange: (count: number) => void }) {
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const count = normalizeCanvasComposerCount(value);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [open]);

    return (
        <div className="relative shrink-0" onMouseDown={(event) => event.stopPropagation()}>
            {open && buttonRect ? <CanvasComposerCountMenu buttonRect={buttonRect} panelRef={panelRef} theme={theme} count={count} onChange={onChange} onClose={() => setOpen(false)} /> : null}
            <button
                ref={buttonRef}
                type="button"
                className="inline-flex h-10 w-[72px] items-center justify-between rounded-xl border px-3 text-sm font-semibold transition hover:opacity-80"
                style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
                onClick={() => setOpen((value) => !value)}
            >
                <span>{count}x</span>
                <ChevronDown className={`size-4 opacity-60 transition ${open ? "rotate-180" : ""}`} />
            </button>
        </div>
    );
}

function CanvasComposerCountMenu({
    buttonRect,
    panelRef,
    theme,
    count,
    onChange,
    onClose,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    count: number;
    onChange: (count: number) => void;
    onClose: () => void;
}) {
    const width = 72;
    const margin = 8;
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, buttonRect.left));
    const style = {
        position: "fixed",
        zIndex: 1300,
        left,
        bottom: window.innerHeight - buttonRect.top + 8,
        width,
        background: theme.toolbar.panel,
        borderColor: theme.toolbar.border,
    } as const;

    return createPortal(
        <div
            ref={panelRef}
            className="overflow-hidden rounded-[22px] border p-1.5 shadow-xl backdrop-blur"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            {canvasComposerCountOptions.map((option) => (
                <button
                    key={option}
                    type="button"
                    className="flex h-8 w-full items-center justify-center rounded-2xl text-lg font-semibold transition hover:opacity-80"
                    style={{ background: option === count ? theme.toolbar.activeBg : "transparent", color: theme.node.text }}
                    onClick={() => {
                        onChange(option);
                        onClose();
                    }}
                >
                    {option}x
                </button>
            ))}
        </div>,
        document.body,
    );
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasNodeGenerationMode): AiConfig {
    const defaultModel = mode === "image" ? globalConfig.imageModel : mode === "video" ? globalConfig.videoModel : mode === "audio" ? globalConfig.audioModel : globalConfig.textModel;
    const count = node.metadata?.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count;
    return {
        ...globalConfig,
        model: node.metadata?.model || defaultModel || (mode === "audio" ? defaultConfig.audioModel : globalConfig.model || defaultConfig.model),
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        audioVoice: node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
        audioFormat: node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node.metadata?.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
        count: String(mode === "image" ? normalizeCanvasComposerCount(count) : count),
    };
}

function normalizeCanvasComposerCount(value: string | number) {
    const count = Math.floor(Math.abs(Number(value)) || 1);
    return canvasComposerCountOptions.includes(count) ? count : 1;
}

function promptPlaceholder(mode: CanvasNodeGenerationMode, hasImageContent: boolean, hasTextContent: boolean) {
    if (mode === "video") return "描述要生成的视频内容";
    if (mode === "audio") return "描述要生成的音频内容";
    if (mode === "image") return hasImageContent ? "请输入你想要把这张图修改成什么" : "描述要生成的图片内容";
    return hasTextContent ? "请输入你想要将本段文本修改成什么" : "请输入你想要生成的文本内容";
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}
