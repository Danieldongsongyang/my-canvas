"use client";

import { useEffect, useRef, useState } from "react";
import { Viewer } from "@photo-sphere-viewer/core";
import { Alert } from "antd";

type CanvasPanoramaViewerProps = {
    src: string;
    title?: string;
    readinessHint?: string | null;
};

export const VIEWER_ERROR_MESSAGE = "全景查看器加载失败，请尝试重新打开或检查图片文件。";

export const ISOLATED_EVENTS = ["wheel", "pointerdown", "pointermove", "pointerup", "mousedown", "mousemove", "mouseup", "dblclick"] as const;

export function stopCanvasEvent(event: Event) {
    event.stopPropagation();
}

export function getMissingPanoramaSrcMessage(src: string) {
    return src ? null : "缺少全景图片地址，无法打开查看器。";
}

export function createPanoramaViewerConfig(container: HTMLDivElement, src: string, title?: string) {
    return {
        container,
        panorama: src,
        caption: title,
        loadingTxt: "正在加载全景图...",
        navbar: ["zoom", "move", "fullscreen"],
    };
}

export function CanvasPanoramaViewer({ src, title, readinessHint }: CanvasPanoramaViewerProps) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        ISOLATED_EVENTS.forEach((eventName) => root.addEventListener(eventName, stopCanvasEvent));
        return () => {
            ISOLATED_EVENTS.forEach((eventName) => root.removeEventListener(eventName, stopCanvasEvent));
        };
    }, []);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        setError(null);

        const missingSrcMessage = getMissingPanoramaSrcMessage(src);
        if (missingSrcMessage) {
            setError(missingSrcMessage);
            return;
        }

        try {
            const viewer = new Viewer(createPanoramaViewerConfig(root, src, title));
            const handlePanoramaError = () => setError(VIEWER_ERROR_MESSAGE);
            viewer.addEventListener("panorama-error", handlePanoramaError);

            return () => {
                viewer.removeEventListener("panorama-error", handlePanoramaError);
                viewer.destroy();
            };
        } catch {
            setError(VIEWER_ERROR_MESSAGE);
        }
    }, [src, title]);

    return (
        <div className="flex w-[min(1120px,calc(100vw-96px))] flex-col gap-3 p-6" data-canvas-no-zoom>
            {readinessHint ? <Alert type="warning" showIcon title={readinessHint} className="text-sm" /> : null}
            {error ? <Alert type="error" showIcon title={error} /> : null}
            <div ref={rootRef} className="h-[min(70vh,720px)] min-h-[360px] w-full overflow-hidden rounded-lg bg-black" aria-label="360 全景图片查看器" />
        </div>
    );
}
