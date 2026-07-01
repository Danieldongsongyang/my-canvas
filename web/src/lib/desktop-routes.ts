const protectedRoutePrefixes = ["/asset-library", "/assets", "/canvas", "/image", "/prompts", "/studio", "/video"];

export function isDesktopLoginRoute(pathname: string) {
    return pathname === "/login";
}

export function isProtectedDesktopRoute(pathname: string) {
    if (isDesktopLoginRoute(pathname)) return false;
    if (pathname === "/") return true;
    return protectedRoutePrefixes.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function buildLoginRedirect(pathname: string, search = "") {
    return `/login?redirect=${encodeURIComponent(`${pathname}${search}`)}`;
}

export function resolveDesktopStartupRedirect(pathname: string, search: string, hasUser: boolean) {
    if (hasUser && isDesktopLoginRoute(pathname)) {
        return "/";
    }

    if (!hasUser && isProtectedDesktopRoute(pathname)) {
        return buildLoginRedirect(pathname, search);
    }

    return null;
}
