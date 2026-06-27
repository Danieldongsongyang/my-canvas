import { describe, expect, it } from "vitest";

import { fetchPrompts } from "@/services/api/prompts";

describe("prompt library api", () => {
    it("filters local prompts by category, tags and keyword", async () => {
        await expect(fetchPrompts({ category: "角色", tag: ["电影感"], keyword: "将军" })).resolves.toMatchObject({
            total: 1,
            items: [{ id: "prompt-character-red-general", title: "红衣将军海报" }],
        });
    });

    it("paginates the local prompt list and keeps global facets", async () => {
        const page = await fetchPrompts({ page: 2, pageSize: 3 });

        expect(page.items.map((item) => item.id)).toEqual(["prompt-weapon-sword", "prompt-scene-chat-room", "prompt-scene-mountain-lake"]);
        expect(page.total).toBe(8);
        expect(page.categories).toEqual(["角色", "道具", "场景", "界面"]);
        expect(page.tags).toContain("产品设计");
    });
});
