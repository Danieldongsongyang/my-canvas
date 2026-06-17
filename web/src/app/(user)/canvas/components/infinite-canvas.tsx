"use client";

import React, { useEffect, useRef, useState } from "react";

import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ViewportTransform } from "../types";

type InfiniteCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    backgroundMode?: CanvasBackgroundMode;
    onViewportChange: (viewport: ViewportTransform) => void;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onCanvasDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onCanvasDeselect?: () => void;
    onContextMenu?: (event: React.MouseEvent) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
};

const CANVAS_WHEEL_IGNORE_SELECTOR = "[data-canvas-no-zoom],input,textarea,select,[contenteditable='true'],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown";
const MIN_CANVAS_SCALE = 0.05;
const MAX_CANVAS_SCALE = 5;

type CanvasGestureEvent = Event & {
    clientX?: number;
    clientY?: number;
    scale?: number;
};

function shouldIgnoreCanvasWheel(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest(CANVAS_WHEEL_IGNORE_SELECTOR));
}

function clampScale(scale: number) {
    return Math.min(Math.max(scale, MIN_CANVAS_SCALE), MAX_CANVAS_SCALE);
}

function normalizeWheelDelta(delta: number, deltaMode: number, pageSize: number) {
    if (deltaMode === 1) return delta * 16;
    if (deltaMode === 2) return delta * pageSize;
    return delta;
}

function zoomViewportAtPoint(viewport: ViewportTransform, pointX: number, pointY: number, scale: number): ViewportTransform {
    const worldX = (pointX - viewport.x) / viewport.k;
    const worldY = (pointY - viewport.y) / viewport.k;
    return {
        x: pointX - worldX * scale,
        y: pointY - worldY * scale,
        k: scale,
    };
}

export function InfiniteCanvas({ containerRef, viewport, backgroundMode = "lines", onViewportChange, onCanvasMouseDown, onCanvasDoubleClick, onCanvasDeselect, onContextMenu, onDrop, children }: InfiniteCanvasProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const panState = useRef({
        isPanning: false,
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        hasMoved: false,
    });
    const scaleRef = useRef(viewport.k);
    const viewportRef = useRef(viewport);
    const frameRef = useRef<number | null>(null);
    const nextViewportRef = useRef<ViewportTransform | null>(null);
    const gestureStateRef = useRef<{ viewport: ViewportTransform } | null>(null);
    const lastGestureAtRef = useRef(0);
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    useEffect(() => {
        viewportRef.current = viewport;
        scaleRef.current = viewport.k;
    }, [viewport]);

    useEffect(
        () => () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        },
        [],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code !== "Space") return;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            setIsSpacePressed(true);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code === "Space") setIsSpacePressed(false);
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        if (shouldIgnoreCanvasWheel(event.target)) return;
        event.preventDefault();

        const currentViewport = viewportRef.current;
        const deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode, window.innerWidth);
        const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode, window.innerHeight);
        if (!event.ctrlKey && !event.metaKey) {
            onViewportChange({
                x: currentViewport.x - deltaX,
                y: currentViewport.y - deltaY,
                k: currentViewport.k,
            });
            return;
        }

        if (Date.now() - lastGestureAtRef.current < 120) return;

        const factor = Math.pow(1.1, -deltaY / 100);
        const newScale = clampScale(currentViewport.k * factor);
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        onViewportChange(zoomViewportAtPoint(currentViewport, mouseX, mouseY, newScale));
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom]")) return;
        if (target?.closest("[data-connection-create-menu]")) return;
        const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id],[data-selection-bounding-box]");

        if (!isBackgroundClick) return;

        if (event.button === 1 || (event.button === 0 && isSpacePressed)) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            panState.current = {
                isPanning: true,
                startX: event.clientX,
                startY: event.clientY,
                initialX: viewport.x,
                initialY: viewport.y,
                hasMoved: false,
            };
            document.body.style.cursor = "grabbing";
            return;
        }

        if (event.button === 0) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onCanvasMouseDown?.(event);
        }
    };

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!panState.current.isPanning) return;

            const dx = event.clientX - panState.current.startX;
            const dy = event.clientY - panState.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                panState.current.hasMoved = true;
            }

            nextViewportRef.current = {
                x: panState.current.initialX + dx,
                y: panState.current.initialY + dy,
                k: scaleRef.current,
            };
            if (frameRef.current) return;
            frameRef.current = requestAnimationFrame(() => {
                frameRef.current = null;
                if (nextViewportRef.current) onViewportChange(nextViewportRef.current);
            });
        };

        const handlePointerUp = () => {
            if (!panState.current.isPanning) return;

            if (!panState.current.hasMoved) {
                onCanvasDeselect?.();
            }
            panState.current.isPanning = false;
            document.body.style.cursor = "default";
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
        };
    }, [onCanvasDeselect, onViewportChange]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const preventWheelScroll = (event: WheelEvent) => {
            if (shouldIgnoreCanvasWheel(event.target)) return;
            event.preventDefault();
        };
        container.addEventListener("wheel", preventWheelScroll, { passive: false });
        return () => container.removeEventListener("wheel", preventWheelScroll);
    }, [containerRef]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const getGesturePoint = (event: CanvasGestureEvent) => {
            const rect = container.getBoundingClientRect();
            return {
                x: (event.clientX ?? rect.left + rect.width / 2) - rect.left,
                y: (event.clientY ?? rect.top + rect.height / 2) - rect.top,
            };
        };

        const handleGestureStart = (event: Event) => {
            if (shouldIgnoreCanvasWheel(event.target)) return;
            event.preventDefault();
            lastGestureAtRef.current = Date.now();
            gestureStateRef.current = { viewport: viewportRef.current };
        };

        const handleGestureChange = (event: Event) => {
            if (shouldIgnoreCanvasWheel(event.target)) return;
            const gestureEvent = event as CanvasGestureEvent;
            const scale = gestureEvent.scale;
            if (!scale) return;
            event.preventDefault();
            lastGestureAtRef.current = Date.now();

            const startViewport = gestureStateRef.current?.viewport || viewportRef.current;
            const point = getGesturePoint(gestureEvent);
            onViewportChange(zoomViewportAtPoint(startViewport, point.x, point.y, clampScale(startViewport.k * scale)));
        };

        const handleGestureEnd = () => {
            gestureStateRef.current = null;
        };

        container.addEventListener("gesturestart", handleGestureStart, { passive: false });
        container.addEventListener("gesturechange", handleGestureChange, { passive: false });
        container.addEventListener("gestureend", handleGestureEnd);
        return () => {
            container.removeEventListener("gesturestart", handleGestureStart);
            container.removeEventListener("gesturechange", handleGestureChange);
            container.removeEventListener("gestureend", handleGestureEnd);
        };
    }, [containerRef, onViewportChange]);

    return (
        <div
            ref={containerRef}
            className="relative h-full w-full cursor-grab select-none overflow-hidden"
            style={{ background: theme.canvas.background }}
            onPointerDown={handlePointerDown}
            onDoubleClick={onCanvasDoubleClick}
            onWheel={handleWheel}
            onContextMenu={onContextMenu}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
        >
            <CanvasGrid viewport={viewport} mode={backgroundMode} />
            <div
                className="absolute origin-top-left"
                style={{
                    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`,
                }}
            >
                {children}
            </div>
        </div>
    );
}

function CanvasGrid({ viewport, mode }: { viewport: ViewportTransform; mode: CanvasBackgroundMode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (mode === "blank") return null;

    const gridSize = 48 * viewport.k;
    const x = viewport.x % gridSize;
    const y = viewport.y % gridSize;
    const dotSize = viewport.k < 0.12 ? 0.8 : 1.15;
    const backgroundImage =
        mode === "dots" ? `radial-gradient(circle, ${theme.canvas.dot} ${dotSize}px, transparent ${dotSize + 0.2}px)` : `linear-gradient(${theme.canvas.line} 1px, transparent 1px), linear-gradient(90deg, ${theme.canvas.line} 1px, transparent 1px)`;

    return (
        <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
                backgroundImage,
                backgroundSize: `${gridSize}px ${gridSize}px`,
                backgroundPosition: `${x}px ${y}px`,
            }}
        />
    );
}
