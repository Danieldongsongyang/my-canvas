declare module "@photo-sphere-viewer/core" {
    export type ViewerConfig = {
        container: HTMLDivElement;
        panorama: string;
        caption?: string;
        loadingTxt?: string;
        navbar?: string[];
    };

    export class Viewer {
        constructor(config: ViewerConfig);
        addEventListener(eventName: string, listener: () => void): void;
        removeEventListener(eventName: string, listener: () => void): void;
        destroy(): void;
    }
}
