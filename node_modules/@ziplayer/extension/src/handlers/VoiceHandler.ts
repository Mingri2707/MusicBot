import type { Player } from "ziplayer";
import type { InternalNode, LavalinkPlayerState } from "../types/lavalink";

export class VoiceHandler {
	private debug: (message: string, ...optional: any[]) => void;

	constructor(debug: boolean) {
		this.debug = (message: string, ...optional: any[]) => {
			if (!debug) return;
			const formatted = `[VoiceHandler] ${message}`;
			console.log(formatted, ...optional);
		};
	}

	async sendVoiceUpdate(node: InternalNode, guildId: string, state: LavalinkPlayerState): Promise<void> {
		if (!state.voiceState?.sessionId || !state.voiceServer) return;

		const payload = {
			voice: {
				token: state.voiceServer.token,
				endpoint: state.voiceServer.endpoint,
				sessionId: state.voiceState.sessionId,
			},
		};
		await node.rest.patch(`/v4/sessions/${node.sessionId}/players/${guildId}`, payload);
	}

	async connect(
		player: Player,
		channel: any,
		sendGatewayPayload?: (guildId: string, payload: any) => Promise<void> | void,
	): Promise<any> {
		const channelId: string | null = channel?.id ?? channel ?? null;
		if (!channelId) throw new Error("Invalid channel provided to connect");
		const guildId = player.guildId;

		if (sendGatewayPayload) {
			await sendGatewayPayload(guildId, {
				op: 4,
				d: {
					guild_id: guildId,
					channel_id: channelId,
					self_deaf: player.options.selfDeaf ?? true,
					self_mute: player.options.selfMute ?? false,
				},
			});
			return null;
		}

		// Fallback to original connect method if no sendGatewayPayload provided
		throw new Error("sendGatewayPayload is required for voice connection");
	}

	handleRawEvent(packet: any, userId: string, playerStateManager: any, nodeManager: any): void {
		if (!packet || typeof packet !== "object") return;
		const t = packet.t as string | undefined;
		if (!t || (t !== "VOICE_STATE_UPDATE" && t !== "VOICE_SERVER_UPDATE")) return;

		const data: any = packet.d;
		const guildId: string | undefined = data?.guild_id ?? data?.guildId;
		if (!guildId) return;

		const player = playerStateManager.getPlayerByGuildId(guildId);
		if (!player) return;

		const state = playerStateManager.getState(player);
		if (!state) return;

		// Store previous voice state to check if update is needed
		const prevVoiceState = { ...state.voiceState };
		const prevVoiceServer = { ...state.voiceServer };

		if (t === "VOICE_SERVER_UPDATE") {
			playerStateManager.handleVoiceServerUpdate(guildId, data);
		} else if (t === "VOICE_STATE_UPDATE") {
			playerStateManager.handleVoiceStateUpdate(guildId, data, userId);
		}

		// Only send voice update if voice state actually changed and we have a node assigned
		const voiceStateChanged =
			prevVoiceState?.sessionId !== state.voiceState?.sessionId ||
			prevVoiceServer?.token !== state.voiceServer?.token ||
			prevVoiceServer?.endpoint !== state.voiceServer?.endpoint;

		if (
			voiceStateChanged &&
			state.voiceState?.sessionId &&
			state.voiceServer?.token &&
			state.voiceServer?.endpoint &&
			state.node
		) {
			playerStateManager.resolveVoiceWaiter(guildId);
			// Only send to the assigned node, not all nodes
			this.sendVoiceUpdate(state.node, guildId, state).catch((error) =>
				this.debug(`Failed to send voiceUpdate for ${guildId} to ${state.node.identifier}`, error),
			);
			// Mark voice update as sent
			state.voiceUpdateSent = true;
		}
	}
}
