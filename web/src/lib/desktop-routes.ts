const protectedRoutePrefixes = ["/admin", "/asset-library", "/assets", "/canvas", "/image", "/prompts", "/video"];

export function isDesktopLoginRoute(pathname: string) {
    return pathname === "/login" || pathname === "/admin/login";
}

export function isProtectedDesktopRoute(pathname: string) {
    if (isDesktopLoginRoute(pathname)) return false;
    if (pathname === "/") return true;
    return protectedRoutePrefixes.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function buildLoginRedirect(pathname: string, search = "") {
    return `/login?redirect=${encodeURIComponent(`${pathname}${search}`)}`;
}
