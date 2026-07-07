import { describe, expect, it } from "vitest";

import { deleteCanvasNodesFromGraph, type CanvasDeletionUiState } from "./canvas-graph-mutations";
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
});
