import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import { isHiddenBatchChild } from "../canvas-page-utils";
import type { CanvasNodeData, Position, ViewportTransform } from "../../types";

type CanvasViewportSize = {
    width: number;
    height: number;
};

type UseCanvasViewportParams = {
    containerRef: RefObject<HTMLDivElement | null>;
    nodes: CanvasNodeData[];
    collapsingBatchIds: Set<string>;
};

const INITIAL_VIEWPORT: ViewportTransform = { x: 0, y: 0, k: 1 };
const INITIAL_SIZE: CanvasViewportSize = { width: 1200, height: 720 };
const VISIBLE_NODE_PADDING = 280;
const MIN_ZOOM_SCALE = 0.05;
const MAX_ZOOM_SCALE = 5;

function clampZoomScale(scale: number) {
    return Math.min(Math.max(scale, MIN_ZOOM_SCALE), MAX_ZOOM_SCALE);
}

export function useCanvasViewport({ containerRef, nodes, collapsingBatchIds }: UseCanvasViewportParams) {
    const didInitialCenterRef = useRef(false);
    const viewportRef = useRef(INITIAL_VIEWPORT);
    const [viewport, setViewport] = useState<ViewportTransform>(INITIAL_VIEWPORT);
    const [size, setSize] = useState(INITIAL_SIZE);

    useLayoutEffect(() => {
        viewportRef.current = viewport;
    }, [viewport]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
            if (!didInitialCenterRef.current) {
                didInitialCenterRef.current = true;
                setViewport({ x: rect.width / 2, y: rect.height / 2, k: 1 });
            }
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, [containerRef]);

    const screenToCanvas = useCallback(
        (clientX: number, clientY: number): Position => {
            const rect = containerRef.current?.getBoundingClientRect();
            const currentViewport = viewportRef.current;
            const localX = clientX - (rect?.left || 0);
            const localY = clientY - (rect?.top || 0);

            return {
                x: (localX - currentViewport.x) / currentViewport.k,
                y: (localY - currentViewport.y) / currentViewport.k,
            };
        },
        [containerRef],
    );

    const getCanvasCenter = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        return screenToCanvas((rect?.left || 0) + (rect?.width || size.width) / 2, (rect?.top || 0) + (rect?.height || size.height) / 2);
    }, [containerRef, screenToCanvas, size.height, size.width]);

    const visibleNodes = useMemo(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        const width = rect?.width || size.width;
        const height = rect?.height || size.height;
        const viewLeft = -viewport.x / viewport.k - VISIBLE_NODE_PADDING;
        const viewTop = -viewport.y / viewport.k - VISIBLE_NODE_PADDING;
        const viewRight = viewLeft + width / viewport.k + VISIBLE_NODE_PADDING * 2;
        const viewBottom = viewTop + height / viewport.k + VISIBLE_NODE_PADDING * 2;

        return nodes.filter((node) => !isHiddenBatchChild(node, nodes, collapsingBatchIds) && node.position.x + node.width > viewLeft && node.position.x < viewRight && node.position.y + node.height > viewTop && node.position.y < viewBottom);
    }, [collapsingBatchIds, containerRef, nodes, size.height, size.width, viewport.k, viewport.x, viewport.y]);

    const resetViewport = useCallback(() => {
        setViewport({ x: size.width / 2, y: size.height / 2, k: 1 });
    }, [size.height, size.width]);

    const setZoomScale = useCallback(
        (scale: number) => {
            const nextScale = clampZoomScale(scale);
            setViewport((prev) => ({
                x: size.width / 2 - ((size.width / 2 - prev.x) / prev.k) * nextScale,
                y: size.height / 2 - ((size.height / 2 - prev.y) / prev.k) * nextScale,
                k: nextScale,
            }));
        },
        [size.height, size.width],
    );

    return {
        viewport,
        setViewport,
        size,
        screenToCanvas,
        getCanvasCenter,
        visibleNodes,
        resetViewport,
        setZoomScale,
    };
}
