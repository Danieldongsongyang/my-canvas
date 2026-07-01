import { beforeEach, describe, expect, it } from "vitest";

import { createInMemoryStudioStorage, createStudioRepository } from "@/services/studio-local";

describe("studio local repository", () => {
    let repository: ReturnType<typeof createStudioRepository>;

    beforeEach(() => {
        repository = createStudioRepository(createInMemoryStudioStorage());
    });

    it("creates a Studio series with a default Episode 01", async () => {
        const series = await repository.createSeries({ title: "山海便利店" });

        expect(series.title).toBe("山海便利店");
        expect(series.episodes).toHaveLength(1);
        expect(series.episodes[0]).toMatchObject({
            title: "Episode 01",
            order: 1,
            script: "",
            shots: [],
        });
        await expect(repository.listSeries()).resolves.toEqual([series]);
    });

    it("updates and deletes Studio series through the repository boundary", async () => {
        const series = await repository.createSeries({ title: "旧标题" });
        const updated = await repository.updateSeries(series.id, { title: "新标题", summary: "三分钟短漫剧" });

        expect(updated).toMatchObject({ title: "新标题", summary: "三分钟短漫剧" });
        await expect(repository.getSeries(series.id)).resolves.toMatchObject({ title: "新标题" });

        await repository.deleteSeries(series.id);

        await expect(repository.listSeries()).resolves.toEqual([]);
        await expect(repository.getSeries(series.id)).resolves.toBeNull();
    });
});
