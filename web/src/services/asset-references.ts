import type { CanvasProject } from "@/app/(user)/canvas/stores/use-canvas-store";
import type { CanvasNodeData } from "@/app/(user)/canvas/types";
import type { StudioAssetRef, StudioSeries } from "@/services/studio-local";

export type AssetReferenceKind = "text" | "image" | "video" | "audio";
export type AssetReferenceRole = "candidate" | "selected" | "reference";

export type AssetRef = {
    assetId: string;
    kind: AssetReferenceKind;
    role?: AssetReferenceRole;
    note?: string;
    metadata?: Record<string, unknown>;
};

export type AssetReferenceLocation =
    | {
          source: "studio";
          assetId: string;
          label: string;
          seriesId: string;
          episodeId?: string;
          itemId?: string;
      }
    | {
          source: "canvas";
          assetId: string;
          label: string;
          canvasId: string;
          nodeId: string;
      };

export type AssetDeletionCheck = {
    canDelete: boolean;
    references: AssetReferenceLocation[];
};

type AssetReferenceSources = {
    studioSeries: StudioSeries[];
    canvasProjects: CanvasProject[];
};

type AssetDeletionSources = {
    studioRepository: {
        listSeries: () => Promise<StudioSeries[]>;
    };
    canvasProjects: CanvasProject[];
};

export function findAssetReferences(assetId: string, sources: AssetReferenceSources): AssetReferenceLocation[] {
    return [...findStudioAssetReferences(assetId, sources.studioSeries), ...findCanvasAssetReferences(assetId, sources.canvasProjects)];
}

export async function checkAssetDeletion(assetId: string, sources: AssetDeletionSources): Promise<AssetDeletionCheck> {
    const studioSeries = await sources.studioRepository.listSeries();
    const references = findAssetReferences(assetId, { studioSeries, canvasProjects: sources.canvasProjects });
    return { canDelete: references.length === 0, references };
}

function findStudioAssetReferences(assetId: string, seriesList: StudioSeries[]): AssetReferenceLocation[] {
    return seriesList.flatMap((series) => {
        const seriesRefs = [
            ...collectStudioEntityReferences(
                assetId,
                series.title,
                series.id,
                undefined,
                series.sharedCharacters.map((item) => ({ id: item.id, title: item.name, assetRefs: item.assetRefs })),
            ),
            ...collectStudioEntityReferences(
                assetId,
                series.title,
                series.id,
                undefined,
                series.sharedScenes.map((item) => ({ id: item.id, title: item.name, assetRefs: item.assetRefs })),
            ),
            ...collectStudioEntityReferences(
                assetId,
                series.title,
                series.id,
                undefined,
                series.sharedProps.map((item) => ({ id: item.id, title: item.name, assetRefs: item.assetRefs })),
            ),
        ];
        const episodeRefs = series.episodes.flatMap((episode) => {
            const prefix = `${series.title} / ${episode.title}`;
            return [
                ...collectStudioEntityReferences(
                    assetId,
                    prefix,
                    series.id,
                    episode.id,
                    episode.characters.map((item) => ({ id: item.id, title: item.name, assetRefs: item.assetRefs })),
                ),
                ...collectStudioEntityReferences(
                    assetId,
                    prefix,
                    series.id,
                    episode.id,
                    episode.scenes.map((item) => ({ id: item.id, title: item.name, assetRefs: item.assetRefs })),
                ),
                ...collectStudioEntityReferences(
                    assetId,
                    prefix,
                    series.id,
                    episode.id,
                    episode.props.map((item) => ({ id: item.id, title: item.name, assetRefs: item.assetRefs })),
                ),
                ...collectStudioEntityReferences(
                    assetId,
                    prefix,
                    series.id,
                    episode.id,
                    episode.shots.map((item) => ({ id: item.id, title: item.title, assetRefs: item.assetRefs })),
                ),
            ];
        });
        return [...seriesRefs, ...episodeRefs];
    });
}

function collectStudioEntityReferences(assetId: string, prefix: string, seriesId: string, episodeId: string | undefined, items: Array<{ id: string; title: string; assetRefs: StudioAssetRef[] }>): AssetReferenceLocation[] {
    return items.flatMap((item) =>
        item.assetRefs.some((ref) => ref.assetId === assetId)
            ? [
                  {
                      source: "studio",
                      assetId,
                      label: `${prefix} / ${item.title}`,
                      seriesId,
                      episodeId,
                      itemId: item.id,
                  },
              ]
            : [],
    );
}

function findCanvasAssetReferences(assetId: string, projects: CanvasProject[]): AssetReferenceLocation[] {
    return projects.flatMap((project) =>
        project.nodes.flatMap((node) =>
            nodeAssetRefs(node).some((ref) => ref.assetId === assetId)
                ? [
                      {
                          source: "canvas",
                          assetId,
                          label: `${project.title} / ${node.title}`,
                          canvasId: project.id,
                          nodeId: node.id,
                      },
                  ]
                : [],
        ),
    );
}

function nodeAssetRefs(node: CanvasNodeData): AssetRef[] {
    const refs = [node.metadata?.assetRef, ...(node.metadata?.assetRefs || [])];
    return refs.filter((ref): ref is AssetRef => Boolean(ref?.assetId));
}
