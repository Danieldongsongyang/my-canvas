"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { App } from "antd";

import { buildLoginRedirect, isDesktopLoginRoute, isProtectedDesktopRoute } from "@/lib/desktop-routes";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const handledConfigParams = useRef(false);
    const pathname = usePathname();
    const router = useRouter();
    const hydrateUser = useUserStore((state) => state.hydrateUser);
    const loadUserModels = useConfigStore((state) => state.loadUserModels);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isLoginPage = isDesktopLoginRoute(pathname);
    const isProtectedPage = isProtectedDesktopRoute(pathname);

    useEffect(() => {
        if (isLoginPage) return;
        void hydrateUser().then((user) => {
            if (!user && isProtectedPage) router.replace(buildLoginRedirect(pathname, window.location.search));
            if (user) void loadUserModels(user.id);
        });
    }, [hydrateUser, isLoginPage, isProtectedPage, loadUserModels, pathname, router]);

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        const baseUrl = searchParams.get("baseUrl") || searchParams.get("baseurl");
        const apiKey = searchParams.get("apiKey") || searchParams.get("apikey");
        if (!baseUrl && !apiKey) return;
        handledConfigParams.current = true;
        searchParams.delete("baseUrl");
        searchParams.delete("baseurl");
        searchParams.delete("apiKey");
        searchParams.delete("apikey");
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
        updateConfig("channelMode", "local");
        if (baseUrl) updateConfig("baseUrl", baseUrl);
        if (apiKey) updateConfig("apiKey", apiKey);
        openConfigDialog(false);
        message.success("已导入本地直连配置");
    }, [message, openConfigDialog, updateConfig]);

    return <>{children}</>;
}
