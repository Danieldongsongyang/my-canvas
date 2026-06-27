import { describe, expect, it } from "vitest";

import { safeLoginRedirect } from "@/lib/login-redirect";

describe("safeLoginRedirect", () => {
    it("allows normal in-app pages", () => {
        expect(safeLoginRedirect("/canvas?from=login")).toBe("/canvas?from=login");
    });

    it("sends local admin redirects back to the tool hub", () => {
        expect(safeLoginRedirect("/admin")).toBe("/");
        expect(safeLoginRedirect("/admin/users")).toBe("/");
    });

    it("blocks open redirects", () => {
        expect(safeLoginRedirect("//evil.example")).toBe("/");
        expect(safeLoginRedirect("/\\evil.example")).toBe("/");
        expect(safeLoginRedirect(null)).toBe("/");
    });
});
