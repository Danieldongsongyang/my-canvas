"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Empty, Input, Modal, Pagination, Tag } from "antd";
import { Check, Image, Images, Palette, Save, Search, Sparkles, Star, Trash2, WandSparkles } from "lucide-react";

import { getAssetCoverUrl, queryLocalAssetLibrary } from "@/lib/local-asset-library";
import { buildCastReferencePrompt, type StudioCastTargetKind } from "@/services/api/studio-generation";
import type { StudioEpisode } from "@/services/studio-local";
import type { Asset } from "@/stores/use-asset-store";
import { cn } from "@/lib/utils";
import { readArtDirectionDraft } from "../studio-workspace-model";

type CastWorkbenchModalProps = {
    open: boolean;
    kind: StudioCastTargetKind | null;
    entityId: string | null;
    episode: StudioEpisode;
    assets: Asset[];
    generating: boolean;
    imageModelReady: boolean;
    imageModelReason: string;
    onGenerate: (kind: StudioCastTargetKind, entityId: string, prompt: string, count: 1 | 2 | 4) => void;
    onSavePrompt: (kind: StudioCastTargetKind, entityId: string, prompt: string) => void;
    onSelectReference: (kind: StudioCastTargetKind, entityId: string, assetId: string) => void;
    onRemoveCandidate: (kind: StudioCastTargetKind, entityId: string, assetId: string) => void;
    onAddLibraryAsset: (kind: StudioCastTargetKind, entityId: string, asset: Asset, role: "candidate" | "selected") => void;
    onClose: () => void;
};

export function CastWorkbenchModal({ open, kind, entityId, episode, assets, generating, imageModelReady, imageModelReason, onGenerate, onSavePrompt, onSelectReference, onRemoveCandidate, onAddLibraryAsset, onClose }: CastWorkbenchModalProps) {
    const entity = useMemo(() => (kind && entityId ? findCastEntity(episode, kind, entityId) : null), [episode, entityId, kind]);
    const style = readArtDirectionDraft(episode);
    const [prompt, setPrompt] = useState("");
    const [count, setCount] = useState<1 | 2 | 4>(1);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

    useEffect(() => {
        if (!open || !entity) return;
        setPrompt(entity.prompt || "");
        setCount(1);
        setLibraryOpen(false);
    }, [entity, open]);

    if (!kind || !entityId || !entity) return null;

    const imageRefs = entity.assetRefs.filter((ref) => ref.kind === "image" && (ref.role === "selected" || ref.role === "candidate"));
    const selectedRef = imageRefs.find((ref) => ref.role === "selected");
    const effectivePrompt = prompt.trim() ? `${buildCastReferencePrompt(kind, prompt)}${style?.positivePrompt ? `\n\nStyle baseline:\n${style.positivePrompt}` : ""}` : "";
    const generateDisabled = generating || !prompt.trim() || !style || !imageModelReady;

    return (
        <Modal
            open={open}
            title={null}
            footer={null}
            width={1080}
            centered
            destroyOnHidden
            onCancel={onClose}
            styles={{
                body: { padding: 0, background: "#131116" },
            }}
        >
            <div className="bg-[#131116] text-[#f2ede4]">
                <header className="flex items-start gap-4 border-b border-[rgba(255,255,255,0.06)] bg-[#0a090c]/75 px-6 py-5">
                    <div className="grid size-10 shrink-0 place-items-center rounded-full border border-[#34d8c4]/35 bg-[#34d8c4]/10 text-[#34d8c4]">
                        <Sparkles className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-[#8b8597]">Cast Workbench</p>
                        <h2 className="mt-1 truncate text-2xl font-semibold text-[#f2ede4]">{entity.name}</h2>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#a8a2b0]">{entity.description || "暂无描述"}</p>
                    </div>
                    <Tag color={selectedRef ? "success" : "warning"}>{selectedRef ? "selected ready" : "missing selected"}</Tag>
                </header>

                <div className="grid max-h-[76vh] grid-cols-1 overflow-hidden xl:grid-cols-[260px_minmax(0,1fr)_300px]">
                    <aside className="min-h-0 space-y-4 overflow-y-auto border-b border-[rgba(255,255,255,0.06)] bg-[#181620]/70 p-5 xl:border-b-0 xl:border-r">
                        <section>
                            <p className="font-mono text-[0.59375rem] uppercase tracking-[0.16em] text-[#8b8597]">Context</p>
                            <dl className="mt-3 space-y-2 text-sm">
                                <div className="flex justify-between gap-3">
                                    <dt className="text-[#8b8597]">类型</dt>
                                    <dd className="text-[#f2ede4]">{kindLabel(kind)}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-[#8b8597]">Variants</dt>
                                    <dd className="text-[#34d8c4]">{imageRefs.length}</dd>
                                </div>
                            </dl>
                        </section>
                        <section className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0a090c]/70 p-4">
                            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#f2ede4]">
                                <Palette className="size-4 text-[#34d8c4]" />
                                Style baseline
                            </div>
                            <p className="text-sm text-[#f2ede4]">{style?.name || "未保存"}</p>
                            <p className="mt-2 line-clamp-4 text-xs leading-5 text-[#a8a2b0]">{style?.positivePrompt || "请先在 Style 步骤保存视觉风格。"}</p>
                            {style?.negativePrompt ? <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#8b8597]">Negative: {style.negativePrompt}</p> : null}
                        </section>
                        {selectedRef ? <ReferencePreview asset={assetMap.get(selectedRef.assetId)} title="当前主参考图" /> : <EmptyReferencePreview />}
                    </aside>

                    <section className="min-h-0 overflow-y-auto p-5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <p className="font-mono text-[0.59375rem] uppercase tracking-[0.16em] text-[#8b8597]">Prompt Editor</p>
                                <h3 className="mt-1 text-lg font-semibold text-[#f2ede4]">基础 prompt</h3>
                            </div>
                            <Button
                                className="!rounded-full !border-[rgba(255,255,255,0.08)] !bg-[rgba(255,255,255,0.045)] !text-[#a8a2b0] hover:!border-[#34d8c4]/35 hover:!text-[#f2ede4]"
                                icon={<Save className="size-4" />}
                                onClick={() => onSavePrompt(kind, entityId, prompt)}
                            >
                                保存
                            </Button>
                            <Button
                                className="!rounded-full !border-[#34d8c4]/40 !bg-[#34d8c4]/10 !text-[#34d8c4] hover:!border-[#34d8c4]/60 hover:!bg-[#34d8c4]/20 hover:!text-[#f2ede4]"
                                icon={<Images className="size-4" />}
                                onClick={() => setLibraryOpen(true)}
                            >
                                从素材库加入
                            </Button>
                        </div>
                        <Input.TextArea className="!font-mono !text-sm !leading-6" value={prompt} autoSize={{ minRows: 8, maxRows: 12 }} spellCheck={false} onChange={(event) => setPrompt(event.target.value)} />

                        <section className="mt-4 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0a090c]/70 p-4">
                            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#f2ede4]">
                                <WandSparkles className="size-4 text-[#ffa94d]" />
                                Effective prompt preview
                            </div>
                            <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-[#a8a2b0]">{effectivePrompt || "填写基础 prompt 后预览最终生成提示词。"}</p>
                        </section>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.045)] p-4">
                            <div className="flex items-center gap-2">
                                {[1, 2, 4].map((value) => (
                                    <button
                                        key={value}
                                        className={cn(
                                            "grid size-9 place-items-center rounded-full border text-sm font-semibold transition",
                                            count === value ? "border-[#34d8c4]/60 bg-[#34d8c4]/15 text-[#34d8c4]" : "border-[rgba(255,255,255,0.08)] text-[#8b8597] hover:text-[#f2ede4]",
                                        )}
                                        onClick={() => setCount(value as 1 | 2 | 4)}
                                    >
                                        {value}
                                    </button>
                                ))}
                            </div>
                            <Button
                                className="!rounded-full !border-[#34d8c4]/65 !bg-[#34d8c4] !font-semibold !text-[#0c0b0e] hover:!bg-[#5ee9d6] disabled:!opacity-50"
                                type="primary"
                                icon={<WandSparkles className="size-4" />}
                                loading={generating}
                                disabled={generateDisabled}
                                onClick={() => onGenerate(kind, entityId, prompt, count)}
                            >
                                生成候选
                            </Button>
                        </div>
                        {!style ? <p className="mt-2 text-xs text-[#ffa94d]">请先保存 Style 定调后再生成。</p> : null}
                        {!imageModelReady ? <p className="mt-2 text-xs text-[#ffa94d]">{imageModelReason || "请先配置可用的图像模型。"}</p> : null}
                    </section>

                    <aside className="min-h-0 overflow-y-auto border-t border-[rgba(255,255,255,0.06)] bg-[#181620]/70 p-5 xl:border-l xl:border-t-0">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <p className="font-mono text-[0.59375rem] uppercase tracking-[0.16em] text-[#8b8597]">Gallery</p>
                                <h3 className="mt-1 text-lg font-semibold text-[#f2ede4]">候选池</h3>
                            </div>
                            <Tag color="default">{imageRefs.length}</Tag>
                        </div>
                        {imageRefs.length ? (
                            <div className="space-y-3">
                                {imageRefs.map((ref) => (
                                    <VariantTile
                                        key={`${ref.assetId}-${ref.role}`}
                                        refItem={ref}
                                        asset={assetMap.get(ref.assetId)}
                                        selected={ref.role === "selected"}
                                        onSelect={() => onSelectReference(kind, entityId, ref.assetId)}
                                        onRemove={() => onRemoveCandidate(kind, entityId, ref.assetId)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed border-[rgba(255,255,255,0.10)] p-6 text-center text-sm text-[#8b8597]">还没有候选图</div>
                        )}
                    </aside>
                </div>
                <CastLibraryAssetModal
                    open={libraryOpen}
                    assets={assets}
                    attachedAssetIds={new Set(imageRefs.map((ref) => ref.assetId))}
                    onAdd={(asset, role) => {
                        onAddLibraryAsset(kind, entityId, asset, role);
                        setLibraryOpen(false);
                    }}
                    onClose={() => setLibraryOpen(false)}
                />
            </div>
        </Modal>
    );
}

function ReferencePreview({ asset, title }: { asset?: Asset; title: string }) {
    const src = asset ? getAssetCoverUrl(asset) : "";
    return (
        <section>
            <p className="mb-2 text-xs text-[#8b8597]">{title}</p>
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-[rgba(255,255,255,0.06)] bg-black/25 text-[#8b8597]">
                {src ? <img src={src} alt={title} className="h-full w-full object-cover" /> : <Image className="size-6" />}
            </div>
        </section>
    );
}

function EmptyReferencePreview() {
    return <div className="rounded-lg border border-dashed border-[rgba(255,255,255,0.10)] p-4 text-sm leading-6 text-[#8b8597]">当前还没有主参考图。首次生成会自动选择第一张，其余保留为 candidate。</div>;
}

function VariantTile({ refItem, asset, selected, onSelect, onRemove }: { refItem: { assetId: string; metadata?: Record<string, unknown> }; asset?: Asset; selected: boolean; onSelect: () => void; onRemove: () => void }) {
    const src = asset ? getAssetCoverUrl(asset) : "";
    const model = typeof refItem.metadata?.model === "string" ? refItem.metadata.model : "";
    const aspectRatio = typeof refItem.metadata?.aspectRatio === "string" ? refItem.metadata.aspectRatio : "";
    const generatedAt = typeof refItem.metadata?.generatedAt === "string" ? refItem.metadata.generatedAt : "";
    const source = typeof refItem.metadata?.source === "string" ? refItem.metadata.source : "";
    const detail = [model, aspectRatio, generatedAt, source === "asset-library" ? "素材库" : ""].filter(Boolean).join(" · ");
    return (
        <div className={cn("overflow-hidden rounded-lg border bg-[#0a090c]/75", selected ? "border-[#34d8c4]/55" : "border-[rgba(255,255,255,0.06)]")}>
            <div className="relative flex aspect-[4/3] items-center justify-center bg-black/25 text-[#8b8597]">
                {src ? <img src={src} alt="Cast variant" className="h-full w-full object-cover" /> : <Image className="size-6" />}
                {selected ? (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[#34d8c4] px-2 py-1 text-[0.625rem] font-semibold text-[#0c0b0e]">
                        <Star className="size-3" />
                        selected
                    </span>
                ) : null}
            </div>
            <div className="space-y-2 p-3">
                <p className="line-clamp-2 text-xs leading-5 text-[#8b8597]">{detail || refItem.assetId}</p>
                <Button className="!rounded-full" size="small" block disabled={selected} icon={selected ? <Check className="size-3.5" /> : <Star className="size-3.5" />} onClick={onSelect}>
                    {selected ? "当前主图" : "设为主图"}
                </Button>
                {!selected ? (
                    <Button className="!rounded-full !border-[#ffa94d]/30 !bg-[#ffa94d]/10 !text-[#ffa94d] hover:!border-[#ffa94d]/55 hover:!bg-[#ffa94d]/15" size="small" block icon={<Trash2 className="size-3.5" />} onClick={onRemove}>
                        移除关系
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

const LIBRARY_PAGE_SIZE = 8;

function CastLibraryAssetModal({ open, assets, attachedAssetIds, onAdd, onClose }: { open: boolean; assets: Asset[]; attachedAssetIds: Set<string>; onAdd: (asset: Asset, role: "candidate" | "selected") => void; onClose: () => void }) {
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const imageAssets = useMemo(() => assets.filter((asset) => asset.kind === "image"), [assets]);
    const result = useMemo(() => queryLocalAssetLibrary(imageAssets, { keyword, kind: "image", page, pageSize: LIBRARY_PAGE_SIZE }), [imageAssets, keyword, page]);

    useEffect(() => {
        if (!open) return;
        setKeyword("");
        setPage(1);
    }, [open]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(result.total / LIBRARY_PAGE_SIZE));
        setPage((current) => Math.min(current, maxPage));
    }, [result.total]);

    return (
        <Modal
            open={open}
            title={null}
            footer={null}
            width={760}
            centered
            destroyOnHidden
            onCancel={onClose}
            styles={{
                body: { padding: 0, background: "#131116" },
            }}
        >
            <div className="bg-[#131116] text-[#f2ede4]">
                <header className="border-b border-[rgba(255,255,255,0.06)] bg-[#0a090c]/75 px-5 py-4">
                    <p className="font-mono text-[0.59375rem] uppercase tracking-[0.18em] text-[#8b8597]">Asset Library</p>
                    <h3 className="mt-1 text-xl font-semibold">选择图片素材</h3>
                    <p className="mt-1 text-sm text-[#a8a2b0]">只会建立 Studio 引用关系，不复制或删除素材库 asset。</p>
                </header>
                <div className="space-y-4 p-5">
                    <Input
                        className="!rounded-full"
                        prefix={<Search className="size-4 text-[#8b8597]" />}
                        placeholder="搜索图片素材"
                        allowClear
                        value={keyword}
                        onChange={(event) => {
                            setKeyword(event.target.value);
                            setPage(1);
                        }}
                    />
                    {result.items.length ? (
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            {result.items.map((asset) => (
                                <LibraryImageCard key={asset.id} asset={asset} attached={attachedAssetIds.has(asset.id)} onAddCandidate={() => onAdd(asset, "candidate")} onSelect={() => onAdd(asset, "selected")} />
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="text-[#8b8597]">没有可加入的图片素材</span>} className="py-10" />
                    )}
                    {result.total > LIBRARY_PAGE_SIZE ? (
                        <div className="flex justify-center">
                            <Pagination size="small" current={page} pageSize={LIBRARY_PAGE_SIZE} total={result.total} showSizeChanger={false} onChange={setPage} />
                        </div>
                    ) : null}
                </div>
            </div>
        </Modal>
    );
}

function LibraryImageCard({ asset, attached, onAddCandidate, onSelect }: { asset: Asset; attached: boolean; onAddCandidate: () => void; onSelect: () => void }) {
    const src = getAssetCoverUrl(asset);
    return (
        <article className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0a090c]/75">
            <div className="relative flex aspect-[4/3] items-center justify-center bg-black/25 text-[#8b8597]">
                {src ? <img src={src} alt={asset.title} className="h-full w-full object-cover" /> : <Image className="size-6" />}
                {attached ? <span className="absolute left-2 top-2 rounded-full bg-[#34d8c4] px-2 py-1 text-[0.625rem] font-semibold text-[#0c0b0e]">已关联</span> : null}
            </div>
            <div className="space-y-2 p-2.5">
                <p className="truncate text-xs font-medium text-[#f2ede4]">{asset.title}</p>
                <div className="grid grid-cols-2 gap-1.5">
                    <Button className="!rounded-full" size="small" disabled={attached} onClick={onAddCandidate}>
                        候选
                    </Button>
                    <Button className="!rounded-full !border-[#34d8c4]/40 !bg-[#34d8c4]/10 !text-[#34d8c4]" size="small" icon={<Star className="size-3.5" />} onClick={onSelect}>
                        主图
                    </Button>
                </div>
            </div>
        </article>
    );
}

function findCastEntity(episode: StudioEpisode, kind: StudioCastTargetKind, entityId: string) {
    const pool = kind === "character" ? episode.characters : kind === "scene" ? episode.scenes : episode.props;
    return pool.find((entity) => entity.id === entityId);
}

function kindLabel(kind: StudioCastTargetKind) {
    if (kind === "character") return "角色";
    if (kind === "scene") return "场景";
    return "道具";
}
