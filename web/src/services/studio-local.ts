import { nanoid } from "nanoid";

import { localForageStorage } from "@/lib/localforage-storage";

export type StudioAssetRef = {
    assetId: string;
    kind: "text" | "image" | "video" | "audio";
    role?: "candidate" | "selected" | "reference";
    note?: string;
    metadata?: Record<string, unknown>;
};

export type StudioShotReferences = {
    characterIds: string[];
    sceneIds: string[];
    propIds: string[];
};

export type StudioCharacter = {
    id: string;
    name: string;
    description: string;
    prompt: string;
    assetRefs: StudioAssetRef[];
    generation?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
};

export type StudioScene = {
    id: string;
    name: string;
    description: string;
    prompt: string;
    assetRefs: StudioAssetRef[];
    generation?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
};

export type StudioProp = {
    id: string;
    name: string;
    description: string;
    prompt: string;
    assetRefs: StudioAssetRef[];
    generation?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
};

export type StudioShot = {
    id: string;
    title: string;
    order: number;
    description: string;
    dialogue?: string;
    prompt?: string;
    assetRefs: StudioAssetRef[];
    generation?: Record<string, unknown>;
    metadata?: Record<string, unknown> & {
        references?: StudioShotReferences;
    };
};

export type StudioEpisode = {
    id: string;
    title: string;
    order: number;
    script: string;
    characters: StudioCharacter[];
    scenes: StudioScene[];
    props: StudioProp[];
    shots: StudioShot[];
    refs?: Record<string, unknown>;
    generation?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};

export type StudioSeries = {
    id: string;
    title: string;
    summary: string;
    stylePrompt: string;
    modelPreferences: {
        textModel?: string;
        imageModel?: string;
        videoModel?: string;
    };
    sharedCharacters: StudioCharacter[];
    sharedScenes: StudioScene[];
    sharedProps: StudioProp[];
    episodes: StudioEpisode[];
    refs?: Record<string, unknown>;
    generation?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};

type StudioLocalState = {
    version: 1;
    series: StudioSeries[];
};

export type StudioSeriesCreateInput = {
    title: string;
    summary?: string;
};

export type StudioSeriesPatch = Partial<Omit<StudioSeries, "id" | "createdAt" | "updatedAt">>;

export type StudioEpisodePatch = Partial<Omit<StudioEpisode, "id" | "createdAt" | "updatedAt">>;

export type StudioStorage = {
    read: () => Promise<StudioLocalState>;
    write: (state: StudioLocalState) => Promise<void>;
};

const STUDIO_STORE_KEY = "infinite-canvas:studio_local_store";
const emptyState = (): StudioLocalState => ({ version: 1, series: [] });

function cloneState(state: StudioLocalState): StudioLocalState {
    return structuredClone(state);
}

function nowIso() {
    return new Date().toISOString();
}

function createDefaultEpisode(createdAt: string): StudioEpisode {
    return {
        id: nanoid(),
        title: "Episode 01",
        order: 1,
        script: "",
        characters: [],
        scenes: [],
        props: [],
        shots: [],
        createdAt,
        updatedAt: createdAt,
    };
}

export function createLocalForageStudioStorage(): StudioStorage {
    return {
        read: async () => {
            const value = await localForageStorage.getItem(STUDIO_STORE_KEY);
            if (!value) return emptyState();
            try {
                const parsed = JSON.parse(value) as StudioLocalState;
                return { version: 1, series: Array.isArray(parsed.series) ? parsed.series : [] };
            } catch {
                return emptyState();
            }
        },
        write: async (state) => {
            await localForageStorage.setItem(STUDIO_STORE_KEY, JSON.stringify(state));
        },
    };
}

export function createInMemoryStudioStorage(initialState: StudioLocalState = emptyState()): StudioStorage {
    let state = cloneState(initialState);
    return {
        read: async () => cloneState(state),
        write: async (nextState) => {
            state = cloneState(nextState);
        },
    };
}

export function createStudioRepository(storage: StudioStorage) {
    return {
        async listSeries() {
            const state = await storage.read();
            return [...state.series].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        },

        async getSeries(id: string) {
            const state = await storage.read();
            return state.series.find((series) => series.id === id) ?? null;
        },

        async createSeries(input: StudioSeriesCreateInput) {
            const state = await storage.read();
            const createdAt = nowIso();
            const title = input.title.trim() || "未命名短漫剧";
            const series: StudioSeries = {
                id: nanoid(),
                title,
                summary: input.summary?.trim() ?? "",
                stylePrompt: "",
                modelPreferences: {},
                sharedCharacters: [],
                sharedScenes: [],
                sharedProps: [],
                episodes: [createDefaultEpisode(createdAt)],
                createdAt,
                updatedAt: createdAt,
            };
            await storage.write({ ...state, series: [series, ...state.series] });
            return series;
        },

        async updateSeries(id: string, patch: StudioSeriesPatch) {
            const state = await storage.read();
            const updatedAt = nowIso();
            let updated: StudioSeries | null = null;
            const series = state.series.map((item) => {
                if (item.id !== id) return item;
                updated = { ...item, ...patch, id: item.id, createdAt: item.createdAt, updatedAt };
                return updated;
            });
            if (!updated) throw new Error("Studio 项目不存在");
            await storage.write({ ...state, series });
            return updated;
        },

        async updateEpisode(seriesId: string, episodeId: string, patch: StudioEpisodePatch) {
            const state = await storage.read();
            const updatedAt = nowIso();
            let updatedEpisode: StudioEpisode | null = null;
            let updatedSeries: StudioSeries | null = null;
            const series = state.series.map((item) => {
                if (item.id !== seriesId) return item;
                const episodes = item.episodes.map((episode) => {
                    if (episode.id !== episodeId) return episode;
                    updatedEpisode = { ...episode, ...patch, id: episode.id, createdAt: episode.createdAt, updatedAt };
                    return updatedEpisode;
                });
                updatedSeries = { ...item, episodes, updatedAt };
                return updatedSeries;
            });
            if (!updatedSeries || !updatedEpisode) throw new Error("Studio 剧集不存在");
            await storage.write({ ...state, series });
            return { series: updatedSeries, episode: updatedEpisode };
        },

        async deleteSeries(id: string) {
            const state = await storage.read();
            await storage.write({ ...state, series: state.series.filter((series) => series.id !== id) });
        },
    };
}

export const studioRepository = createStudioRepository(createLocalForageStudioStorage());
