"use client";

import { Copy, Download, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Drawer, Empty, Image, Input, Pagination, Tag, Typography } from "antd";
import { saveAs } from "file-saver";

import { useCopyText } from "@/hooks/use-copy-text";
import { getAssetCardSummary, getAssetCoverUrl, getAssetDetailSummary, getAssetFallbackText, getAssetKindLabel, queryLocalAssetLibrary } from "@/lib/local-asset-library";
import { cn } from "@/lib/utils";
import { useAssetStore, type Asset, type AssetKind } from "@/stores/use-asset-store";

const PAGE_SIZE = 12;

const assetTypeOptions = [
    { label: "全部", value: "" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
] as const;

export default function AssetLibraryPage() {
    const copyText = useCopyText();
    const assets = useAssetStore((state) => state.assets);
    const [keyword, setKeyword] = useState("");
    const [selectedType, setSelectedType] = useState<AssetKind | "">("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

    const result = useMemo(() => queryLocalAssetLibrary(assets, { keyword, kind: selectedType, tags: selectedTags, page, pageSize: PAGE_SIZE }), [assets, keyword, selectedType, selectedTags, page]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        setPage((current) => Math.min(current, maxPage));
    }, [result.total]);

    const toggleTag = (tag: string) => {
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };

    const copyAssetText = (asset: Asset) => {
        if (asset.kind !== "text") return;
        copyText(asset.data.content, "文本已复制");
    };

    const downloadAsset = (asset: Asset) => {
        if (!isDownloadableAsset(asset)) return;
        saveAs(getAssetDownloadUrl(asset), getAssetDownloadFileName(asset));
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]">
                <div className="pb-8">
                    <div className="mx-auto max-w-5xl text-center">
                        <h1 className="text-4xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">素材库</h1>
                        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">浏览本地素材，按类型、标签和关键词快速找到可复用的文本、图片和视频。</p>
                    </div>
                    <div className="mx-auto mt-8 w-full max-w-2xl">
                        <Input
                            size="large"
                            className="w-full"
                            prefix={<Search className="size-4 text-stone-400" />}
                            value={keyword}
                            placeholder="按标题、标签、来源或内容搜索"
                            onChange={(event) => {
                                setPage(1);
                                setKeyword(event.target.value);
                            }}
                        />
                    </div>
                    <div className="mx-auto mt-6 max-w-6xl space-y-3">
                        <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                            <div className="pt-2 text-xs font-medium text-stone-500 dark:text-stone-400">类型</div>
                            <div className="flex flex-wrap gap-2">
                                {assetTypeOptions.map((item) => (
                                    <Tag.CheckableTag
                                        key={item.value || "all"}
                                        checked={selectedType === item.value}
                                        className={cn("prompt-filter-tag", selectedType === item.value && "is-active")}
                                        onChange={() => {
                                            setPage(1);
                                            setSelectedType(item.value);
                                            setSelectedTags([]);
                                        }}
                                    >
                                        {item.label}
                                    </Tag.CheckableTag>
                                ))}
                            </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                            <div className="pt-2 text-xs font-medium text-stone-500 dark:text-stone-400">标签</div>
                            <div className="flex flex-wrap gap-2">
                                <Tag.CheckableTag
                                    checked={selectedTags.length === 0}
                                    className={cn("prompt-filter-tag", selectedTags.length === 0 && "is-active")}
                                    onChange={() => {
                                        setPage(1);
                                        setSelectedTags([]);
                                    }}
                                >
                                    全部
                                </Tag.CheckableTag>
                                {result.tags.map((tag) => (
                                    <Tag.CheckableTag
                                        key={tag}
                                        checked={selectedTags.includes(tag)}
                                        className={cn("prompt-filter-tag", selectedTags.includes(tag) && "is-active")}
                                        onChange={() => {
                                            setPage(1);
                                            toggleTag(tag);
                                        }}
                                    >
                                        {tag}
                                    </Tag.CheckableTag>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mx-auto flex max-w-7xl flex-col gap-5">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
                        {result.items.map((asset) => (
                            <LibraryCard key={asset.id} asset={asset} onOpen={() => setSelectedAsset(asset)} onCopy={copyAssetText} onDownload={downloadAsset} />
                        ))}
                    </div>

                    {!result.items.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到素材" className="py-20" /> : null}

                    {result.total > PAGE_SIZE ? (
                        <div className="flex justify-center">
                            <Pagination current={page} pageSize={PAGE_SIZE} total={result.total} showSizeChanger={false} onChange={(nextPage) => setPage(nextPage)} />
                        </div>
                    ) : null}
                </div>
            </main>

            <Drawer title="素材详情" open={Boolean(selectedAsset)} size="large" onClose={() => setSelectedAsset(null)}>
                {selectedAsset ? (
                    <div className="space-y-5">
                        <AssetDetailMedia asset={selectedAsset} />
                        <div>
                            <Typography.Title level={4} className="!mb-2">
                                {selectedAsset.title}
                            </Typography.Title>
                            <div className="flex flex-wrap gap-1.5">
                                <Tag>{getAssetKindLabel(selectedAsset.kind)}</Tag>
                                {selectedAsset.tags.map((tag) => (
                                    <Tag key={tag}>{tag}</Tag>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                            <Typography.Text type="secondary" className="block text-xs">
                                内容
                            </Typography.Text>
                            {selectedAsset.kind === "text" ? (
                                <Typography.Paragraph className="mt-2 whitespace-pre-wrap">{getAssetDetailSummary(selectedAsset)}</Typography.Paragraph>
                            ) : (
                                <Typography.Text className="mt-2 block">{getAssetDetailSummary(selectedAsset)}</Typography.Text>
                            )}
                        </div>
                        {selectedAsset.note ? <Typography.Paragraph type="secondary">{selectedAsset.note}</Typography.Paragraph> : null}
                        <div className="flex flex-wrap gap-2">
                            {selectedAsset.kind === "text" ? (
                                <Button type="primary" icon={<Copy className="size-4" />} onClick={() => copyAssetText(selectedAsset)}>
                                    复制文本
                                </Button>
                            ) : (
                                <Button type="primary" icon={<Download className="size-4" />} onClick={() => downloadAsset(selectedAsset)}>
                                    {getAssetDownloadActionLabel(selectedAsset)}
                                </Button>
                            )}
                        </div>
                    </div>
                ) : null}
            </Drawer>
        </div>
    );
}

function LibraryCard({ asset, onOpen, onCopy, onDownload }: { asset: Asset; onOpen: () => void; onCopy: (asset: Asset) => void; onDownload: (asset: Asset) => void }) {
    return (
        <Card
            hoverable
            className="overflow-hidden"
            styles={{ body: { padding: 0 } }}
            cover={
                <button type="button" className="block w-full text-left" onClick={onOpen}>
                    <LibraryCardCover asset={asset} />
                </button>
            }
        >
            <button type="button" className="block w-full text-left" onClick={onOpen}>
                <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <h2 className="line-clamp-1 text-sm font-semibold text-stone-950 dark:text-stone-100">{asset.title}</h2>
                        <Tag className="m-0 shrink-0 text-[11px]">{getAssetKindLabel(asset.kind)}</Tag>
                    </div>
                    <Typography.Paragraph type="secondary" ellipsis={{ rows: 3 }} className="!mb-0 !mt-2 !text-xs !leading-5">
                        {getAssetCardSummary(asset)}
                    </Typography.Paragraph>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {asset.tags.slice(0, 3).map((tag) => (
                            <Tag key={tag} className="m-0 text-[11px]">
                                {tag}
                            </Tag>
                        ))}
                        {!asset.tags.length ? <Tag className="m-0 text-[11px]">无标签</Tag> : null}
                    </div>
                </div>
            </button>
            <div className="flex items-center gap-2 px-4 pb-4">
                <Button size="small" onClick={onOpen}>
                    查看
                </Button>
                {asset.kind === "text" ? (
                    <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => onCopy(asset)}>
                        复制
                    </Button>
                ) : (
                    <Button size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(asset)}>
                        下载
                    </Button>
                )}
            </div>
        </Card>
    );
}

type DownloadableAsset = Extract<Asset, { kind: "image" | "video" }>;

function isDownloadableAsset(asset: Asset): asset is DownloadableAsset {
    return asset.kind === "image" || asset.kind === "video";
}

function getAssetDownloadUrl(asset: DownloadableAsset) {
    if (asset.kind === "video") return asset.data.url;
    return asset.data.dataUrl;
}

function getAssetDownloadFileName(asset: DownloadableAsset) {
    return `${asset.title || "asset"}.${asset.data.mimeType.split("/")[1] || "png"}`;
}

function getAssetDownloadActionLabel(asset: DownloadableAsset) {
    if (asset.kind === "video") return "下载视频";
    return "下载图片";
}

function AssetDetailMedia({ asset }: { asset: Asset }) {
    if (asset.kind === "video") {
        return <video src={asset.data.url} controls className="aspect-video w-full rounded-lg bg-black" />;
    }

    const cover = getAssetCoverUrl(asset);
    if (cover) {
        return <Image src={cover} alt={asset.title} className="rounded-lg" />;
    }

    return <div className="rounded-lg border border-stone-200 bg-stone-50 p-5 text-sm leading-6 text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">{getAssetFallbackText(asset)}</div>;
}

function LibraryCardCover({ asset }: { asset: Asset }) {
    if (asset.kind === "video") {
        return <div className="flex aspect-[4/3] items-center justify-center bg-stone-950 p-5 text-center text-sm text-white">视频素材</div>;
    }

    const cover = getAssetCoverUrl(asset);
    if (cover) {
        return <img src={cover} alt={asset.title} className="aspect-[4/3] w-full object-cover" />;
    }

    return <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-5 text-center text-sm leading-6 text-stone-600 dark:bg-stone-900 dark:text-stone-300">{getAssetFallbackText(asset)}</div>;
}
