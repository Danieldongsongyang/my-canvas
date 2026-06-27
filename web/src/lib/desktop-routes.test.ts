import { describe, expect, it } from "vitest";

import { buildLoginRedirect, isDesktopLoginRoute, isProtectedDesktopRoute, resolveDesktopStartupRedirect } from "@/lib/desktop-routes";

describe("desktop route guards", () => {
    it("treats the root tool hub as a login-only page", () => {
        expect(isProtectedDesktopRoute("/")).toBe(true);
        expect(isDesktopLoginRoute("/")).toBe(false);
    });

    it("does not redirect the login page back to itself or treat removed admin pages as login routes", () => {
        expect(isDesktopLoginRoute("/login")).toBe(true);
        expect(isDesktopLoginRoute("/admin/login")).toBe(false);
        expect(isProtectedDesktopRoute("/login")).toBe(false);
        expect(isProtectedDesktopRoute("/admin")).toBe(false);
    });

    it("builds a safe login redirect for protected pages with search params", () => {
        expect(buildLoginRedirect("/canvas", "?project=demo")).toBe("/login?redirect=%2Fcanvas%3Fproject%3Ddemo");
    });

    it("sends authenticated users away from the login page and unauthenticated users to login for protected pages", () => {
        expect(resolveDesktopStartupRedirect("/login", "", true)).toBe("/");
        expect(resolveDesktopStartupRedirect("/canvas", "?project=demo", false)).toBe("/login?redirect=%2Fcanvas%3Fproject%3Ddemo");
        expect(resolveDesktopStartupRedirect("/admin", "", false)).toBeNull();
    });
});
