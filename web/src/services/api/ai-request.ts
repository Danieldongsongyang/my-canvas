import { userAuthHeaders } from "@/services/api/auth";
import { ensureRemoteRelayUserId, refreshRemoteUserSession } from "@/services/api/canvas-relay";
import { buildApiUrl, type AiConfig } from "@/stores/use-config-store";

export function aiApiUrl(config: AiConfig, path: string) {
    return config.channelMode === "remote" ? `/api/canvas/relay${path}` : buildApiUrl(config.baseUrl, path);
}

export async function aiRequestHeaders(config: AiConfig, contentType?: string): Promise<Record<string, string>> {
    let headers: Record<string, string>;
    if (config.channelMode === "remote") {
        headers = userAuthHeaders(await ensureRemoteRelayUserId());
    } else {
        headers = { Authorization: `Bearer ${config.apiKey}` };
    }
    return contentType ? { ...headers, "Content-Type": contentType } : headers;
}

export function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode === "remote") refreshRemoteUserSession();
}
