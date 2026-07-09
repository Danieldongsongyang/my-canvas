// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasPanoramaViewer } from "./canvas-panorama-viewer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const viewerMock = vi.hoisted(() => ({
    instances: [] as Array<{
        config: Record<string, unknown>;
        destroy: ReturnType<typeof vi.fn>;
        addEventListener: ReturnType<typeof vi.fn>;
        removeEventListener: ReturnType<typeof vi.fn>;
    }>,
    throwOnCreate: false,
}));

vi.mock("@photo-sphere-viewer/core", () => ({
    Viewer: vi.fn().mockImplementation((config: Record<string, unknown>) => {
        if (viewerMock.throwOnCreate) throw new Error("viewer failed");
        const instance = {
            config,
            destroy: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        };
        viewerMock.instances.push(instance);
        return instance;
    }),
}));

describe("CanvasPanoramaViewer", () => {
    let host: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        viewerMock.instances = [];
        viewerMock.throwOnCreate = false;
        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    it("renders a stable panorama container and initializes the viewer with the image", () => {
        act(() => {
            root.render(<CanvasPanoramaViewer src="data:image/png;base64,abc" title="测试全景" readinessHint={null} />);
        });

        const container = host.querySelector("[aria-label='360 全景图片查看器']");
        expect(container).toBeTruthy();
        expect(container?.className).toContain("min-h-[360px]");
        expect(viewerMock.instances).toHaveLength(1);
        expect(viewerMock.instances[0].config).toMatchObject({
            container,
            panorama: "data:image/png;base64,abc",
            caption: "测试全景",
        });
    });

    it("shows a non-blocking Chinese hint for unsuitable panorama dimensions", () => {
        act(() => {
            root.render(<CanvasPanoramaViewer src="data:image/png;base64,abc" readinessHint="当前图片不是 2:1 比例，全景查看可能出现拉伸或接缝。" />);
        });

        expect(host.textContent).toContain("当前图片不是 2:1 比例，全景查看可能出现拉伸或接缝。");
        expect(viewerMock.instances).toHaveLength(1);
    });

    it("shows a Chinese error instead of a blank viewer when initialization fails", () => {
        viewerMock.throwOnCreate = true;

        act(() => {
            root.render(<CanvasPanoramaViewer src="broken-url" />);
        });

        expect(host.textContent).toContain("全景查看器加载失败");
        expect(viewerMock.instances).toHaveLength(0);
    });

    it("cleans up the previous viewer on src changes and unmount", () => {
        act(() => {
            root.render(<CanvasPanoramaViewer src="first-url" />);
        });
        const first = viewerMock.instances[0];

        act(() => {
            root.render(<CanvasPanoramaViewer src="second-url" />);
        });

        expect(first.destroy).toHaveBeenCalledTimes(1);
        expect(viewerMock.instances).toHaveLength(2);
        expect(viewerMock.instances[1].config).toMatchObject({ panorama: "second-url" });

        act(() => root.unmount());

        expect(viewerMock.instances[1].destroy).toHaveBeenCalledTimes(1);
    });

    it("stops viewer interaction events before they reach the canvas layer", () => {
        const parentEvents = {
            wheel: vi.fn(),
            pointerdown: vi.fn(),
            mousedown: vi.fn(),
            dblclick: vi.fn(),
        };
        Object.entries(parentEvents).forEach(([eventName, handler]) => host.addEventListener(eventName, handler));

        act(() => {
            root.render(<CanvasPanoramaViewer src="data:image/png;base64,abc" />);
        });

        const container = host.querySelector("[aria-label='360 全景图片查看器']")!;
        Object.keys(parentEvents).forEach((eventName) => {
            container.dispatchEvent(new Event(eventName, { bubbles: true, cancelable: true }));
        });

        Object.values(parentEvents).forEach((handler) => expect(handler).not.toHaveBeenCalled());
    });
});
