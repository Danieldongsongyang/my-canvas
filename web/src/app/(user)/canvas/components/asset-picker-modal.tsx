"use client";

import { useEffect, useMemo, useState } from "react";
import { Empty, Input, Modal, Pagination, Tabs, Tag } from "antd";
import { Search } from "lucide-react";

import { getAssetCoverUrl, getAssetKindLabel, queryLocalAssetLibrary, toInsertAssetPayload, type InsertAssetPayload } from "@/lib/local-asset-library";
import { cn } from "@/lib/utils";
import { useAssetStore, type AssetKind } from "@/stores/use-asset-store";

export type AssetPickerTab = "my-assets" | "library";
export type { InsertAssetPayload };

type Props = {
    open: boolean;
    defaultTab?: AssetPickerTab;
    onInsert: (payload: InsertAssetPayload) => void;
    onClose: () => void;
};

export function AssetPickerModal({ open, defaultTab = "my-assets", onInsert, onClose }: Props) {
    const [activeTab, setActiveTab] = useState<AssetPickerTab>(defaultTab);

    useEffect(() => {
        if (open) setActiveTab(defaultTab);
    }, [open, defaultTab]);

    return (
        <Modal title="选择素材" open={open} onCancel={onClose} footer={null} width={860} destroyOnHidden styles={{ body: { padding: "0 24px 24px", minHeight: 480 } }}>
            <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as AssetPickerTab)}
                items={[
                    { key: "my-assets", label: "我的素材", children: <MyAssetsTab onInsert={onInsert} /> },
                    { key: "library", label: "素材库", children: <LibraryTab onInsert={onInsert} /> },
                ]}
            />
        </Modal>
    );
}

const PAGE_SIZE = 8;

const kindOptions = [
    { label: "全部", value: "all" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
] as const;

const libraryKindOptions = [
    { label: "全部", value: "" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
] as const;

function LibraryTab({ onInsert }: { onInsert: (payload: InsertAssetPayload) => void }) {
    const assets = useAssetStore((state) => state.assets);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetKind | "">("");
    const [page, setPage] = useState(1);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    const result = useMemo(() => queryLocalAssetLibrary(assets, { keyword, kind: kindFilter, tags: selectedTags, page, pageSize: PAGE_SIZE }), [assets, keyword, kindFilter, selectedTags, page]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        setPage((current) => Math.min(current, maxPage));
    }, [result.total]);

    const toggleTag = (tag: string) => setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    className="w-56"
                    size="small"
                    prefix={<Search className="size-3.5 text-stone-400" />}
                    placeholder="搜索素材"
                    value={keyword}
                    allowClear
                    onChange={(e) => {
                        setPage(1);
                        setKeyword(e.target.value);
                    }}
                />
                <div className="flex gap-1.5">
                    {libraryKindOptions.map((opt) => (
                        <Tag.CheckableTag
                            key={opt.value || "all"}
                            checked={kindFilter === opt.value}
                            className={cn("prompt-filter-tag", kindFilter === opt.value && "is-active")}
                            onChange={() => {
                                setPage(1);
                                setKindFilter(opt.value);
                                setSelectedTags([]);
                            }}
                        >
                            {opt.label}
                        </Tag.CheckableTag>
                    ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                    <Tag.CheckableTag
                        checked={selectedTags.length === 0}
                        className={cn("prompt-filter-tag", selectedTags.length === 0 && "is-active")}
                        onChange={() => {
                            setPage(1);
                            setSelectedTags([]);
                        }}
                    >
                        全部标签
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

            {result.items.length ? (
                <div className="grid grid-cols-4 gap-3">
                    {result.items.map((asset) => (
                        <PickerCard key={asset.id} title={asset.title} kind={asset.kind} cover={getAssetCoverUrl(asset)} onClick={() => onInsert(toInsertAssetPayload(asset))} />
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有素材" className="py-12" />
            )}

            {result.total > PAGE_SIZE && (
                <div className="flex justify-center">
                    <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={result.total} onChange={setPage} showSizeChanger={false} />
                </div>
            )}
        </div>
    );
}

function PickerCard({ title, kind, cover, onClick }: { title: string; kind: AssetKind; cover: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className="group relative cursor-pointer overflow-hidden rounded-lg border border-stone-200 bg-white text-left transition hover:border-stone-400 hover:shadow-md dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-500"
            onClick={onClick}
        >
            <PickerCardPreview title={title} kind={kind} cover={cover} />
            <div className="p-2.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="line-clamp-1 text-xs font-medium text-stone-800 dark:text-stone-200">{title}</span>
                    <Tag className="m-0 shrink-0 text-[10px]">{getAssetKindLabel(kind)}</Tag>
                </div>
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-stone-950/0 text-sm font-medium text-white opacity-0 transition group-hover:bg-stone-950/55 group-hover:opacity-100">插入</div>
        </button>
    );
}

function PickerCardPreview({ title, kind, cover }: { title: string; kind: AssetKind; cover: string }) {
    if (kind === "video") {
        return <div className="flex aspect-[4/3] items-center justify-center bg-stone-950 p-3 text-center text-xs font-medium tracking-wide text-white">视频素材</div>;
    }

    if (cover) {
        return <img src={cover} alt={title} className="aspect-[4/3] w-full object-cover" />;
    }

    return <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-3 text-center text-xs leading-5 text-stone-500 dark:bg-stone-800 dark:text-stone-400">{title}</div>;
}

function MyAssetsTab({ onInsert }: { onInsert: (payload: InsertAssetPayload) => void }) {
    const assets = useAssetStore((state) => state.assets);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
    const [page, setPage] = useState(1);

    const result = useMemo(() => queryLocalAssetLibrary(assets, { keyword, kind: kindFilter, page, pageSize: PAGE_SIZE }), [assets, keyword, kindFilter, page]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        setPage((v) => Math.min(v, maxPage));
    }, [result.total]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    className="w-56"
                    size="small"
                    prefix={<Search className="size-3.5 text-stone-400" />}
                    placeholder="搜索素材"
                    value={keyword}
                    allowClear
                    onChange={(e) => {
                        setPage(1);
                        setKeyword(e.target.value);
                    }}
                />
                <div className="flex gap-1.5">
                    {kindOptions.map((opt) => (
                        <Tag.CheckableTag
                            key={opt.value}
                            checked={kindFilter === opt.value}
                            className={cn("prompt-filter-tag", kindFilter === opt.value && "is-active")}
                            onChange={() => {
                                setPage(1);
                                setKindFilter(opt.value);
                            }}
                        >
                            {opt.label}
                        </Tag.CheckableTag>
                    ))}
                </div>
            </div>

            {result.items.length ? (
                <div className="grid grid-cols-4 gap-3">
                    {result.items.map((asset) => (
                        <PickerCard key={asset.id} title={asset.title} kind={asset.kind} cover={getAssetCoverUrl(asset)} onClick={() => onInsert(toInsertAssetPayload(asset))} />
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有素材" className="py-12" />
            )}

            {result.total > PAGE_SIZE && (
                <div className="flex justify-center">
                    <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={result.total} onChange={setPage} showSizeChanger={false} />
                </div>
            )}
        </div>
    );
}
