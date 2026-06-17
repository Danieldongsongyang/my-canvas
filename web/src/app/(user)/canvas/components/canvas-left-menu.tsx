"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "antd";
import { FileText, History, Image as ImageIcon, LayoutGrid, Music2, Plus, Redo2, Settings2, Trash2, Upload, Video, Wrench } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

type CanvasLeftMenuProps = {
    canUndo: boolean;
    canRedo: boolean;
    onAddText: () => void;
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddConfig: () => void;
    onUpload: () => void;
    onProjects: () => void;
    onOpenAssetLibrary: () => void;
    onOpenMyAssets: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onClear: () => void;
};

export function CanvasLeftMenu({ canUndo, canRedo, onAddText, onAddImage, onAddVideo, onAddAudio, onAddConfig, onUpload, onProjects, onOpenAssetLibrary, onOpenMyAssets, onUndo, onRedo, onClear }: CanvasLeftMenuProps) {
    const colorTheme = useThemeStore((state) => state.theme);
    const user = useUserStore((state) => state.user);
    const theme = canvasThemes[colorTheme];
    const isDark = colorTheme === "dark";
    const menuRef = useRef<HTMLDivElement>(null);
    const [openMenu, setOpenMenu] = useState<"add" | "assets" | "history" | "tools" | null>(null);

    useEffect(() => {
        if (!openMenu) return;
        const close = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setOpenMenu(null);
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [openMenu]);

    const run = (callback: () => void) => {
        setOpenMenu(null);
        callback();
    };

    const userName = user?.displayName || user?.username || "";
    const avatarUrl = user?.avatarUrl?.trim();
    const avatarText = (userName.trim()[0] || "U").toUpperCase();
    const panelStyle = {
        background: isDark ? "rgba(31,29,26,.96)" : "rgba(251,250,247,.96)",
        borderColor: theme.toolbar.border,
        color: theme.toolbar.item,
        boxShadow: isDark ? "0 24px 60px rgba(0,0,0,.42)" : "0 22px 52px rgba(28,25,23,.14)",
    };
    const primaryStyle = isDark ? { background: "#f8fafc", color: "#020617" } : { background: "#1c1917", color: "#fafaf9" };

    return (
        <div ref={menuRef} className="pointer-events-auto absolute left-4 top-1/2 z-50 -translate-y-1/2" data-canvas-no-zoom>
            <div className="flex flex-col items-center gap-2 rounded-full border p-1 shadow-2xl backdrop-blur" style={panelStyle}>
                <button
                    type="button"
                    className="mb-2 grid size-10 cursor-pointer place-items-center rounded-full transition duration-200 hover:scale-110"
                    style={primaryStyle}
                    onClick={() => setOpenMenu((current) => (current === "add" ? null : "add"))}
                    aria-label="新建节点"
                    title="新建节点"
                >
                    <Plus className="size-5" />
                </button>

                <div className="flex flex-col gap-4 px-1 py-2">
                    <MenuButton label="我的画布" onClick={onProjects}>
                        <LayoutGrid className="size-5" />
                    </MenuButton>
                    <MenuButton label="素材" active={openMenu === "assets"} onClick={() => setOpenMenu((current) => (current === "assets" ? null : "assets"))}>
                        <ImageIcon className="size-5" />
                    </MenuButton>
                    <MenuButton label="历史" active={openMenu === "history"} onClick={() => setOpenMenu((current) => (current === "history" ? null : "history"))}>
                        <History className="size-5" />
                    </MenuButton>
                    <MenuButton label="工具" active={openMenu === "tools"} onClick={() => setOpenMenu((current) => (current === "tools" ? null : "tools"))}>
                        <Wrench className="size-5" />
                    </MenuButton>
                </div>

                <div className="my-1 h-px w-8" style={{ background: theme.toolbar.border }} />

                <button type="button" className="mb-2 grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full border transition duration-200 hover:scale-110" style={{ borderColor: theme.toolbar.border }} aria-label="账户">
                    <Avatar size={30} src={avatarUrl ? <img src={avatarUrl} alt={userName} referrerPolicy="no-referrer" /> : undefined} className="!bg-transparent !text-[11px] !font-semibold" style={{ color: theme.node.text }}>
                        {avatarText}
                    </Avatar>
                </button>
            </div>

            {openMenu === "add" ? (
                <Flyout title="新建节点" style={panelStyle}>
                    <FlyoutButton icon={<FileText className="size-4" />} label="文本" onClick={() => run(onAddText)} />
                    <FlyoutButton icon={<ImageIcon className="size-4" />} label="图片" onClick={() => run(onAddImage)} />
                    <FlyoutButton icon={<Video className="size-4" />} label="视频" onClick={() => run(onAddVideo)} />
                    <FlyoutButton icon={<Music2 className="size-4" />} label="音频" onClick={() => run(onAddAudio)} />
                    <FlyoutButton icon={<Settings2 className="size-4" />} label="生成配置" onClick={() => run(onAddConfig)} />
                    <FlyoutButton icon={<Upload className="size-4" />} label="上传素材" onClick={() => run(onUpload)} />
                </Flyout>
            ) : null}

            {openMenu === "assets" ? (
                <Flyout title="素材" style={panelStyle}>
                    <FlyoutButton icon={<ImageIcon className="size-4" />} label="素材库" onClick={() => run(onOpenAssetLibrary)} />
                    <FlyoutButton icon={<LayoutGrid className="size-4" />} label="我的素材" onClick={() => run(onOpenMyAssets)} />
                </Flyout>
            ) : null}

            {openMenu === "history" ? (
                <Flyout title="历史" style={panelStyle}>
                    <FlyoutButton icon={<History className="size-4" />} label="撤销" disabled={!canUndo} onClick={() => run(onUndo)} />
                    <FlyoutButton icon={<Redo2 className="size-4" />} label="重做" disabled={!canRedo} onClick={() => run(onRedo)} />
                </Flyout>
            ) : null}

            {openMenu === "tools" ? (
                <Flyout title="工具" style={panelStyle}>
                    <FlyoutButton icon={<Settings2 className="size-4" />} label="配置节点" onClick={() => run(onAddConfig)} />
                    <FlyoutButton icon={<Upload className="size-4" />} label="上传素材" onClick={() => run(onUpload)} />
                    <FlyoutButton danger icon={<Trash2 className="size-4" />} label="清空画布" onClick={() => run(onClear)} />
                </Flyout>
            ) : null}
        </div>
    );
}

function MenuButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];

    return (
        <button
            type="button"
            className="grid size-8 cursor-pointer place-items-center rounded-full transition duration-200 hover:scale-125"
            style={{ color: active ? theme.toolbar.activeText : theme.toolbar.item }}
            onClick={onClick}
            aria-label={label}
            title={label}
        >
            {children}
        </button>
    );
}

function Flyout({ title, style, children }: { title: string; style: CSSProperties; children: ReactNode }) {
    return (
        <div className="absolute left-14 top-0 z-[60] w-48 rounded-lg border p-2 shadow-2xl backdrop-blur" style={style}>
            <div className="px-2 pb-2 text-xs font-medium opacity-55">{title}</div>
            <div className="grid gap-1">{children}</div>
        </div>
    );
}

function FlyoutButton({ icon, label, disabled, danger, onClick }: { icon: ReactNode; label: string; disabled?: boolean; danger?: boolean; onClick: () => void }) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];

    return (
        <button
            type="button"
            className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-35"
            style={{ color: danger ? "#f87171" : theme.node.text }}
            disabled={disabled}
            onClick={onClick}
            onMouseEnter={(event) => {
                if (!disabled) event.currentTarget.style.background = theme.toolbar.itemHover;
            }}
            onMouseLeave={(event) => {
                event.currentTarget.style.background = "transparent";
            }}
        >
            <span className="grid size-7 shrink-0 place-items-center rounded-md" style={{ background: theme.toolbar.itemHover, color: danger ? "#f87171" : theme.toolbar.item }}>
                {icon}
            </span>
            <span className="min-w-0 truncate">{label}</span>
        </button>
    );
}
