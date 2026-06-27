export function safeLoginRedirect(value: string | null) {
    const cleaned = (value ?? "").replace(/[\t\n\r]/g, "");
    if (!cleaned.startsWith("/") || cleaned.startsWith("//") || cleaned.startsWith("/\\")) {
        return "/";
    }
    if (cleaned === "/admin" || cleaned.startsWith("/admin/")) {
        return "/";
    }
    return cleaned;
}
