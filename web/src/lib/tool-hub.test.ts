import { describe, expect, it } from "vitest";

import { createMangeBackendWebLinks, toolHubTools } from "@/lib/tool-hub";

describe("tool hub", () => {
    it("offers canvas as the primary tool and keeps the comic workflow as a placeholder", () => {
        expect(toolHubTools.map((tool) => tool.key)).toEqual(["canvas", "comic"]);
        expect(toolHubTools[0]).toMatchObject({
            href: "/canvas",
            status: "ready",
        });
        expect(toolHubTools[1]).toMatchObject({
            status: "soon",
        });
    });

    it("opens account and model management capabilities in mange-backend web", () => {
        expect(createMangeBackendWebLinks("https://mange.example.com/")).toEqual([
            { key: "register", label: "注册账号", href: "https://mange.example.com/register" },
            { key: "account", label: "账号中心", href: "https://mange.example.com/user" },
            { key: "users", label: "用户管理", href: "https://mange.example.com/user" },
            { key: "models", label: "模型管理", href: "https://mange.example.com/channel" },
            { key: "keys", label: "Key 管理", href: "https://mange.example.com/token" },
            { key: "credits", label: "额度与用量", href: "https://mange.example.com/user" },
            { key: "settings", label: "后台设置", href: "https://mange.example.com/user" },
        ]);
    });
});
