import type { Player } from "ziplayer";
import type { LavalinkPlayerState, InternalNode, VoiceServerRawEvent, VoiceServerState } from "../types/lavalink";

/**
 * Manages player states and voice connection handling for Lavalink players.
 *
 * This class handles:
 * - Player state tracking and synchronization
 * - Voice connection state management
 * - Voice server and state update handling
 * - Player-to-node mapping and assignment
 * - Voice connection timeout and error handling
 *
 * @example
 * ```typescript
 * const stateManager = new PlayerStateManager(true); // debug enabled
 *
 * // Attach a player
 * stateManager.attachPlayer(player);
 *
 * // Handle voice updates
 * stateManager.handleVoiceServerUpdate(guildId, voiceServerData);
 * stateManager.handleVoiceStateUpdate(guildId, voiceStateData, userId);
 *
 * // Wait for voice connection
 * await stateManager.waitForVoice(player, 15000);
 * ```
 *
 * @since 1.0.0
 */
export class PlayerStateManager {
	private playerStates = new WeakMap<Player, LavalinkPlayerState>();
	private guildMap = new Map<string, Player>();
	private voiceWaiters = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
	private debug: (message: string, ...optional: any[]) => void;

	/**
	 * Creates a new PlayerStateManager instance.
	 *
	 * @param debug - Whether to enable debug logging
	 *
	 * @example
	 * ```typescript
	 * const stateManager = new PlayerStateManager(true);
	 * ```
	 */
	constructor(debug: boolean) {
		this.debug = (message: string, ...optional: any[]) => {
			if (!debug) return;
			const formatted = `[PlayerStateManager] ${message}`;
			console.log(formatted, ...optional);
		};
	}

	/**
	 * Attaches a player to the state manager.
	 *
	 * This method initializes the player state and sets up tracking:
	 * - Creates a new state object for the player
	 * - Maps the guild ID to the player for quick lookup
	 * - Initializes default state values
	 *
	 * @param player - The player instance to attach
	 *
	 * @example
	 * ```typescript
	 * stateManager.attachPlayer(player);
	 * ```
	 */
	attachPlayer(player: Player): void {
		if (!player) return;
		this.guildMap.set(player.guildId, player);

		if (!this.playerStates.has(player)) {
			this.playerStates.set(player, {
				playing: false,
				paused: false,
				volume: player.volume ?? 100,
				skipNext: false,
				awaitingNode: false,
				awaitingTrack: false,
				voiceTimeout: null,
				lastPosition: 0,
				autoPlayChecked: false,
				voiceUpdateSent: false,
			});
		}
	}

	/**
	 * Detaches a player from the state manager.
	 *
	 * This method cleans up the player state and removes tracking:
	 * - Removes the player from the guild mapping
	 * - Cleans up voice waiters for the guild
	 * - Removes the player state from tracking
	 * - Removes the player from the assigned node
	 *
	 * @param player - The player instance to detach
	 *
	 * @example
	 * ```typescript
	 * stateManager.detachPlayer(player);
	 * ```
	 */
	detachPlayer(player: Player): void {
		const state = this.playerStates.get(player);
		if (state?.node) {
			state.node.players.delete(player.guildId);
		}
		if (player.guildId) {
			this.voiceWaiters.get(player.guildId)?.reject(new Error("Player detached"));
			this.voiceWaiters.delete(player.guildId);
		}
		this.playerStates.delete(player);
		this.guildMap.delete(player.guildId);
	}

	getState(player: Player): LavalinkPlayerState | undefined {
		return this.playerStates.get(player);
	}

	setState(player: Player, state: Partial<LavalinkPlayerState>): void {
		const currentState = this.playerStates.get(player);
		if (currentState) {
			Object.assign(currentState, state);
		}
	}

	getPlayerByGuildId(guildId: string): Player | undefined {
		return this.guildMap.get(guildId);
	}

	/**
	 * Handles voice server update events from Discord.
	 *
	 * This method processes voice server updates that contain:
	 * - Voice server token for authentication
	 * - Voice server endpoint for connection
	 * - Guild ID for identification
	 *
	 * @param guildId - Discord guild ID
	 * @param data - Voice server update data from Discord
	 *
	 * @example
	 * ```typescript
	 * stateManager.handleVoiceServerUpdate("123456789", {
	 *   token: "voice_token",
	 *   endpoint: "voice.example.com",
	 *   guild_id: "123456789"
	 * });
	 * ```
	 */
	handleVoiceServerUpdate(guildId: string, data: any): void {
		const player = this.guildMap.get(guildId);
		if (!player) return;

		const state = this.playerStates.get(player);
		if (!state) return;

		const token: string | undefined = data?.token;
		if (!token) return;
		const endpoint: string | null = typeof data?.endpoint === "string" ? data.endpoint : null;
		const resolvedGuildId = String(data?.guild_id ?? data?.guildId ?? guildId);
		const rawEvent: VoiceServerRawEvent = {
			...(typeof data === "object" && data !== null ? data : {}),
			token,
			endpoint,
			guild_id: resolvedGuildId,
		};
		if ("guildId" in rawEvent) {
			delete rawEvent.guildId;
		}
		state.voiceServer = {
			token,
			endpoint,
			guildId: resolvedGuildId,
			rawEvent,
		};
		this.debug(`VOICE_SERVER_UPDATE for guild ${guildId}`);
	}

	/**
	 * Handles voice state update events from Discord.
	 *
	 * This method processes voice state updates that contain:
	 * - Session ID for voice connection
	 * - Channel ID for voice channel
	 * - User ID for verification
	 *
	 * @param guildId - Discord guild ID
	 * @param data - Voice state update data from Discord
	 * @param userId - Discord user ID to verify against
	 *
	 * @example
	 * ```typescript
	 * stateManager.handleVoiceStateUpdate("123456789", {
	 *   session_id: "session_123",
	 *   channel_id: "456789012",
	 *   user_id: "789012345"
	 * }, "789012345");
	 * ```
	 */
	handleVoiceStateUpdate(guildId: string, data: any, userId: string): void {
		const player = this.guildMap.get(guildId);
		if (!player) return;

		const state = this.playerStates.get(player);
		if (!state) return;

		const userIdFromData = data?.user_id ?? data?.userId;
		if (userId && userIdFromData !== userId) return;

		state.voiceState = {
			sessionId: data?.session_id ?? null,
			channelId: data?.channel_id ?? null,
		};
		state.channelId = data?.channel_id ?? null;
		this.debug(`VOICE_STATE_UPDATE for guild ${guildId} (channel ${state.channelId ?? "null"})`);

		if (!state.channelId) {
			state.playing = false;
			state.paused = false;
			state.track = null;
			state.awaitingTrack = false;
		}
	}

	/**
	 * Waits for voice connection to be established for a player.
	 *
	 * This method waits until both voice server and voice state updates
	 * have been received, indicating the voice connection is ready.
	 *
	 * @param player - The player to wait for voice connection
	 * @param timeoutMs - Timeout in milliseconds (default: 15000)
	 * @returns Promise that resolves when voice is ready or rejects on timeout
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   await stateManager.waitForVoice(player, 10000);
	 *   console.log("Voice connection ready!");
	 * } catch (error) {
	 *   console.log("Voice connection timed out");
	 * }
	 * ```
	 */
	waitForVoice(player: Player, timeoutMs: number = 15000): Promise<void> {
		const state = this.playerStates.get(player);
		if (!state) return Promise.resolve();
		if (state.voiceState?.sessionId && state.voiceServer?.token && state.voiceServer?.endpoint) {
			return Promise.resolve();
		}

		const guildId = player.guildId;
		if (this.voiceWaiters.has(guildId)) {
			return new Promise((resolve, reject) => {
				const existing = this.voiceWaiters.get(guildId)!;
				const originalResolve = existing.resolve;
				const originalReject = existing.reject;
				existing.resolve = () => {
					originalResolve();
					resolve();
				};
				existing.reject = (error: Error) => {
					originalReject(error);
					reject(error);
				};
			});
		}

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.voiceWaiters.delete(guildId);
				reject(new Error("Voice connection timed out"));
			}, timeoutMs);
			this.voiceWaiters.set(guildId, {
				resolve: () => {
					clearTimeout(timer);
					this.voiceWaiters.delete(guildId);
					resolve();
				},
				reject: (error: Error) => {
					clearTimeout(timer);
					this.voiceWaiters.delete(guildId);
					reject(error);
				},
				timer,
			});
		});
	}

	resolveVoiceWaiter(guildId: string): void {
		this.voiceWaiters.get(guildId)?.resolve();
		this.voiceWaiters.delete(guildId);
	}

	rejectVoiceWaiter(guildId: string, error: Error): void {
		this.voiceWaiters.get(guildId)?.reject(error);
		this.voiceWaiters.delete(guildId);
	}

	getAllPlayers(): Player[] {
		return Array.from(this.guildMap.values());
	}

	getAllStates(): Map<Player, LavalinkPlayerState> {
		const states = new Map<Player, LavalinkPlayerState>();
		for (const player of this.guildMap.values()) {
			const state = this.playerStates.get(player);
			if (state) {
				states.set(player, state);
			}
		}
		return states;
	}

	updatePlayerPosition(player: Player, position: number): void {
		const state = this.playerStates.get(player);
		if (state) {
			state.lastPosition = position;
		}
	}

	setPlayerNode(player: Player, node: InternalNode): void {
		const state = this.playerStates.get(player);
		if (state) {
			// Reset voice update sent flag when node changes
			state.voiceUpdateSent = false;
			state.node = node;
			node.players.add(player.guildId);
		}
	}

	clearPlayerNode(player: Player): void {
		const state = this.playerStates.get(player);
		if (state?.node) {
			state.node.players.delete(player.guildId);
			state.node = undefined;
		}
	}

	destroy(): void {
		// Clear all voice waiters
		for (const [guildId, waiter] of this.voiceWaiters) {
			clearTimeout(waiter.timer);
			waiter.reject(new Error("PlayerStateManager destroyed"));
		}
		this.voiceWaiters.clear();
		this.playerStates = new WeakMap();
		this.guildMap.clear();
	}
}
