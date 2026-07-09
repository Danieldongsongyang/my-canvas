import { describe, expect, it } from "vitest";

import { applyCanvasBatchPrimaryImage, applyUploadedMediaToCanvasGraph, deleteCanvasNodesFromGraph, type CanvasDeletionUiState } from "./canvas-graph-mutations";
import { CanvasNodeType, type CanvasNodeData } from "../types";

function node(id: string, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.Image,
        title: id,
        position: { x: 0, y: 0 },
        width: 120,
        height: 120,
        metadata,
    };
}

function deletionUiState(overrides: Partial<CanvasDeletionUiState> = {}): CanvasDeletionUiState {
    return {
        selectedNodeIds: new Set(),
        selectedConnectionId: null,
        hoveredNodeId: null,
        toolbarNodeId: null,
        dialogNodeId: null,
        editingNodeId: null,
        infoNodeId: null,
        cropNodeId: null,
        maskEditNodeId: null,
        splitNodeId: null,
        upscaleNodeId: null,
        superResolveNodeId: null,
        angleNodeId: null,
        previewNodeId: null,
        runningNodeId: null,
        contextMenu: null,
        ...overrides,
    };
}

describe("canvas graph mutations", () => {
    it("creates uploaded media nodes and returns the expected selection and dialog state", () => {
        const imageResult = applyUploadedMediaToCanvasGraph({
            nodes: [],
            connections: [],
            upload: {
                mode: "create",
                type: CanvasNodeType.Image,
                title: "reference.png",
                position: { x: 500, y: 320 },
                width: 300,
                height: 180,
                metadata: { content: "image:url", status: "success" },
                createId: () => "image-upload",
            },
        });
        const videoResult = applyUploadedMediaToCanvasGraph({
            nodes: [],
            connections: [],
            upload: {
                mode: "create",
                type: CanvasNodeType.Video,
                title: "clip.mp4",
                position: { x: 200, y: 160 },
                width: 420,
                height: 236,
                metadata: { content: "video:url", status: "success" },
                createId: () => "video-upload",
            },
        });
        const audioResult = applyUploadedMediaToCanvasGraph({
            nodes: [],
            connections: [],
            upload: {
                mode: "create",
                type: CanvasNodeType.Audio,
                title: "voice.mp3",
                position: { x: 180, y: 120 },
                width: 340,
                height: 120,
                metadata: { content: "audio:url", status: "success" },
                createId: () => "audio-upload",
            },
        });

        expect(imageResult.nodes[0]).toMatchObject({
            id: "image-upload",
            type: CanvasNodeType.Image,
            title: "reference.png",
            position: { x: 350, y: 230 },
            width: 300,
            height: 180,
            metadata: { content: "image:url", status: "success" },
        });
        expect(videoResult.nodes[0]).toMatchObject({ id: "video-upload", type: CanvasNodeType.Video, position: { x: -10, y: 42 } });
        expect(audioResult.nodes[0]).toMatchObject({ id: "audio-upload", type: CanvasNodeType.Audio, position: { x: 10, y: 60 } });
        expect(imageResult.uiState).toMatchObject({ selectedConnectionId: null, dialogNodeId: "image-upload" });
        expect(videoResult.uiState).toMatchObject({ selectedConnectionId: null, dialogNodeId: "video-upload" });
        expect(audioResult.uiState).toMatchObject({ selectedConnectionId: null, dialogNodeId: null });
        expect(imageResult.uiState.selectedNodeIds).toEqual(new Set(["image-upload"]));
        expect(videoResult.uiState.selectedNodeIds).toEqual(new Set(["video-upload"]));
        expect(audioResult.uiState.selectedNodeIds).toEqual(new Set(["audio-upload"]));
    });

    it("replaces an existing upload target without dropping graph connections", () => {
        const result = applyUploadedMediaToCanvasGraph({
            nodes: [
                node("source"),
                node("target", {
                    content: "",
                    status: "error",
                    errorDetails: "生成失败",
                    isBatchRoot: true,
                    batchChildIds: ["stale-child"],
                    generationType: "edit",
                    references: ["image:old"],
                }),
            ],
            connections: [{ id: "conn-source-target", fromNodeId: "source", toNodeId: "target" }],
            upload: {
                mode: "replace",
                nodeId: "target",
                type: CanvasNodeType.Image,
                title: "replacement.png",
                width: 260,
                height: 200,
                metadata: { content: "image:new", status: "success", naturalWidth: 1024, naturalHeight: 768 },
            },
            uiState: { selectedNodeIds: new Set(["source"]), selectedConnectionId: "conn-source-target", dialogNodeId: "source" },
        });

        expect(result.nodes).toHaveLength(2);
        expect(result.connections).toEqual([{ id: "conn-source-target", fromNodeId: "source", toNodeId: "target" }]);
        expect(result.nodes[1]).toMatchObject({
            id: "target",
            type: CanvasNodeType.Image,
            title: "replacement.png",
            width: 260,
            height: 200,
            metadata: { content: "image:new", status: "success", naturalWidth: 1024, naturalHeight: 768 },
        });
        expect(result.nodes[1].metadata).not.toHaveProperty("errorDetails");
        expect(result.nodes[1].metadata).not.toHaveProperty("isBatchRoot");
        expect(result.nodes[1].metadata).not.toHaveProperty("batchChildIds");
        expect(result.nodes[1].metadata).not.toHaveProperty("generationType");
        expect(result.nodes[1].metadata).not.toHaveProperty("references");
        expect(result.uiState.selectedNodeIds).toEqual(new Set(["target"]));
        expect(result.uiState).toMatchObject({ selectedConnectionId: null, dialogNodeId: "target" });
    });

    it("deletes a normal node and clears related connections and transient UI references", () => {
        const result = deleteCanvasNodesFromGraph({
            nodes: [node("a"), node("b"), node("c")],
            connections: [
                { id: "conn-a-b", fromNodeId: "a", toNodeId: "b" },
                { id: "conn-b-c", fromNodeId: "b", toNodeId: "c" },
            ],
            nodeIds: new Set(["b"]),
            uiState: deletionUiState({
                selectedNodeIds: new Set(["b", "c"]),
                selectedConnectionId: "conn-b-c",
                hoveredNodeId: "b",
                toolbarNodeId: "b",
                dialogNodeId: "b",
                editingNodeId: "c",
                infoNodeId: "b",
                previewNodeId: "b",
                runningNodeId: "b",
                contextMenu: { type: "node", x: 0, y: 0, nodeId: "b" },
            }),
        });

        expect(result.deletedNodeIds).toEqual(new Set(["b"]));
        expect(result.nodes.map((item) => item.id)).toEqual(["a", "c"]);
        expect(result.connections).toEqual([]);
        expect(result.uiState).toMatchObject({
            selectedConnectionId: null,
            hoveredNodeId: null,
            toolbarNodeId: null,
            dialogNodeId: null,
            editingNodeId: "c",
            infoNodeId: null,
            previewNodeId: null,
            runningNodeId: null,
            contextMenu: null,
        });
        expect(result.uiState?.selectedNodeIds).toEqual(new Set());
    });

    it("deletes a batch root with its children and every affected connection", () => {
        const result = deleteCanvasNodesFromGraph({
            nodes: [
                node("a"),
                node("root", { isBatchRoot: true, batchChildIds: ["child-a", "child-b"], primaryImageId: "child-a" }),
                node("child-a", { batchRootId: "root", content: "child-a.png" }),
                node("child-b", { batchRootId: "root", content: "child-b.png" }),
                node("b"),
            ],
            connections: [
                { id: "conn-a-root", fromNodeId: "a", toNodeId: "root" },
                { id: "conn-root-b", fromNodeId: "root", toNodeId: "b" },
                { id: "conn-child-a", fromNodeId: "child-a", toNodeId: "a" },
            ],
            nodeIds: new Set(["root"]),
        });

        expect(result.deletedNodeIds).toEqual(new Set(["root", "child-a", "child-b"]));
        expect(result.nodes.map((item) => item.id)).toEqual(["a", "b"]);
        expect(result.connections).toEqual([]);
    });

    it("deletes a batch child and keeps the root metadata pointed at a remaining child", () => {
        const result = deleteCanvasNodesFromGraph({
            nodes: [
                node("root", { isBatchRoot: true, batchChildIds: ["child-a", "child-b"], primaryImageId: "child-a", content: "old.png", naturalWidth: 100, naturalHeight: 100 }),
                node("child-a", { batchRootId: "root", content: "child-a.png", naturalWidth: 200, naturalHeight: 160 }),
                node("child-b", { batchRootId: "root", content: "child-b.png", naturalWidth: 300, naturalHeight: 240 }),
                node("b"),
            ],
            connections: [
                { id: "conn-root-b", fromNodeId: "root", toNodeId: "b" },
                { id: "conn-child-a", fromNodeId: "child-a", toNodeId: "b" },
            ],
            nodeIds: new Set(["child-a"]),
            uiState: deletionUiState({
                selectedNodeIds: new Set(["child-a"]),
                splitNodeId: "child-a",
                upscaleNodeId: "child-a",
                superResolveNodeId: "child-a",
                angleNodeId: "child-a",
                contextMenu: { type: "connection", x: 0, y: 0, connectionId: "conn-child-a" },
            }),
        });

        expect(result.deletedNodeIds).toEqual(new Set(["child-a"]));
        expect(result.nodes.map((item) => item.id)).toEqual(["root", "child-b", "b"]);
        expect(result.connections).toEqual([{ id: "conn-root-b", fromNodeId: "root", toNodeId: "b" }]);
        expect(result.nodes[0].metadata).toMatchObject({
            batchChildIds: ["child-b"],
            primaryImageId: "child-b",
            content: "child-b.png",
            naturalWidth: 300,
            naturalHeight: 240,
        });
        expect(result.uiState).toMatchObject({
            splitNodeId: null,
            upscaleNodeId: null,
            superResolveNodeId: null,
            angleNodeId: null,
            contextMenu: null,
        });
    });

    it("copies panorama intent when a panorama batch child becomes primary", () => {
        const result = applyCanvasBatchPrimaryImage({
            nodes: [
                node("root", { isBatchRoot: true, batchChildIds: ["child-a"], primaryImageId: "old", content: "old.png", naturalWidth: 100, naturalHeight: 100, freeResize: false, panorama: false }),
                node("child-a", { batchRootId: "root", content: "pano.png", naturalWidth: 2048, naturalHeight: 1024, freeResize: true, panorama: true }),
            ],
            child: node("child-a", { batchRootId: "root", content: "pano.png", naturalWidth: 2048, naturalHeight: 1024, freeResize: true, panorama: true }),
        });

        expect(result[0]).toMatchObject({
            width: 120,
            height: 120,
            metadata: {
                content: "pano.png",
                primaryImageId: "child-a",
                naturalWidth: 2048,
                naturalHeight: 1024,
                freeResize: true,
                panorama: true,
            },
        });
    });

    it("copies flat image intent when a normal batch child becomes primary", () => {
        const result = applyCanvasBatchPrimaryImage({
            nodes: [
                node("root", { isBatchRoot: true, batchChildIds: ["child-a"], content: "pano.png", panorama: true }),
                node("child-a", { batchRootId: "root", content: "flat.png", naturalWidth: 1024, naturalHeight: 768, freeResize: false, panorama: false }),
            ],
            child: node("child-a", { batchRootId: "root", content: "flat.png", naturalWidth: 1024, naturalHeight: 768, freeResize: false, panorama: false }),
        });

        expect(result[0].metadata).toMatchObject({
            content: "flat.png",
            primaryImageId: "child-a",
            naturalWidth: 1024,
            naturalHeight: 768,
            freeResize: false,
            panorama: false,
        });
    });

    it("does not change the batch root when the selected child has no content", () => {
        const nodes = [
            node("root", { isBatchRoot: true, batchChildIds: ["child-a"], content: "root.png", primaryImageId: "root", naturalWidth: 100, naturalHeight: 100, panorama: true }),
            node("child-a", { batchRootId: "root", panorama: false }),
        ];

        const result = applyCanvasBatchPrimaryImage({ nodes, child: nodes[1] });

        expect(result).toBe(nodes);
        expect(result[0].metadata).toMatchObject({ content: "root.png", primaryImageId: "root", panorama: true });
    });
});
