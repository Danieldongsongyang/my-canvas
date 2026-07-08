import { saveAs } from "file-saver";

import { createZip } from "@/lib/zip";
import { assetMediaStorage, collectAssetMediaStorageKeys, inferAssetMediaFileExtension } from "@/services/asset-media-storage";
import type { CanvasExportAsset, CanvasExportFile } from "../export-types";
import type { CanvasProject } from "../stores/use-canvas-store";

export async function exportCanvasProjects(projects: CanvasProject[], fileName = "无限画布") {
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const exportedProjects = await Promise.all(
        projects.map(async (project) => {
            const files: CanvasExportAsset[] = [];
            await Promise.all(
                [...collectAssetMediaStorageKeys(project)].map(async (storageKey) => {
                    const blob = await assetMediaStorage.readBlob(storageKey);
                    if (!blob) return;
                    const path = `projects/${project.id}/files/${safeFileName(storageKey)}.${inferAssetMediaFileExtension(blob.type, storageKey)}`;
                    files.push({ storageKey, path, mimeType: blob.type || "application/octet-stream", bytes: blob.size });
                    zipFiles.push({ name: path, data: blob });
                }),
            );
            return { project, files };
        }),
    );

    const data: CanvasExportFile = { app: "infinite-canvas", version: 3, exportedAt: new Date().toISOString(), projects: exportedProjects };
    const zip = await createZip([{ name: "projects.json", data: JSON.stringify(data, null, 2) }, ...zipFiles]);
    saveAs(zip, `${safeFileName(fileName)}.zip`);
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
}
