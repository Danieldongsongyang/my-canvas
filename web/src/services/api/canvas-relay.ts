import { ensureCanvasRelayToken } from "@/services/api/auth";
import { useUserStore } from "@/stores/use-user-store";

export async function ensureRemoteRelayUserId() {
    const { user, relayReady } = useUserStore.getState();
    if (!user?.id) throw new Error("请先登录并初始化云端 Relay");
    if (!relayReady) {
        const relay = await ensureCanvasRelayToken(user.id);
        if (!relay.relay_ready) throw new Error("Relay API Key 初始化失败");
        useUserStore.setState({ relayReady: true });
    }
    return user.id;
}

export function refreshRemoteUserSession() {
    void useUserStore.getState().hydrateUser();
}
