import { describe, expect, it } from "vitest";

import { buildLoginRedirect, isDesktopLoginRoute, isProtectedDesktopRoute } from "@/lib/desktop-routes";

describe("desktop route guards", () => {
    it("treats the root tool hub as a login-only page", () => {
        expect(isProtectedDesktopRoute("/")).toBe(true);
        expect(isDesktopLoginRoute("/")).toBe(false);
    });

    it("does not redirect the login page back to itself", () => {
        expect(isDesktopLoginRoute("/login")).toBe(true);
        expect(isProtectedDesktopRoute("/login")).toBe(false);
    });

    it("builds a safe login redirect for protected pages with search params", () => {
        expect(buildLoginRedirect("/canvas", "?project=demo")).toBe("/login?redirect=%2Fcanvas%3Fproject%3Ddemo");
    });
});
