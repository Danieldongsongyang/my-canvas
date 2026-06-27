"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { App } from "antd";

import { resolveDesktopStartupRedirect } from "@/lib/desktop-routes";
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
    useEffect(() => {
        void hydrateUser().then((user) => {
            const redirectTarget = resolveDesktopStartupRedirect(pathname, window.location.search, Boolean(user));
            if (redirectTarget) {
                router.replace(redirectTarget);
                return;
            }
            if (user) void loadUserModels(user.id);
        });
    }, [hydrateUser, loadUserModels, pathname, router]);

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
