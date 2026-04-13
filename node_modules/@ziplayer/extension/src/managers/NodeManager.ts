import axios, { AxiosInstance } from "axios";
import type { InternalNode, LavalinkNodeOptions, LavalinkExtOptions } from "../types/lavalink";
import { WebSocketHandler } from "../handlers/WebSocketHandler";

/**
 * Manages Lavalink node connections and operations.
 *
 * This class handles:
 * - Connection management to multiple Lavalink nodes
 * - Load balancing and node selection strategies
 * - REST API operations for track loading and player management
 * - WebSocket event handling for real-time updates
 * - Automatic failover and reconnection
 *
 * @example
 * ```typescript
 * const nodeManager = new NodeManager({
 *   nodes: [
 *     { host: "localhost", port: 2333, password: "youshallnotpass" },
 *     { host: "backup.example.com", port: 443, password: "backup", secure: true }
 *   ],
 *   debug: true
 * });
 *
 * // Initialize connections
 * await nodeManager.initializeConnections("botUserId", "MyBot");
 *
 * // Select best node
 * const node = nodeManager.selectNode("players");
 * ```
 *
 * @since 1.0.0
 */
export class NodeManager {
	private nodes: InternalNode[] = [];
	private wsHandler: WebSocketHandler;
	private debug: (message: string, ...optional: any[]) => void;

	/**
	 * Creates a new NodeManager instance.
	 *
	 * @param options - Lavalink extension options containing node configurations
	 * @param options.nodes - Array of Lavalink node configurations
	 * @param options.debug - Enable debug logging (optional)
	 * @param options.clientName - Client name for identification (optional)
	 * @param options.requestTimeoutMs - Request timeout in milliseconds (optional)
	 *
	 * @example
	 * ```typescript
	 * const nodeManager = new NodeManager({
	 *   nodes: [
	 *     { host: "localhost", port: 2333, password: "youshallnotpass" }
	 *   ],
	 *   debug: true,
	 *   clientName: "MyBot",
	 *   requestTimeoutMs: 10000
	 * });
	 * ```
	 */
	constructor(options: LavalinkExtOptions) {
		this.debug = (message: string, ...optional: any[]) => {
			if (!options.debug) return;
			const formatted = `[NodeManager] ${message}`;
			console.log(formatted, ...optional);
		};
		this.wsHandler = new WebSocketHandler(options.debug ?? false);
		this.initializeNodes(options);
	}

	private initializeNodes(options: LavalinkExtOptions): void {
		for (const config of options.nodes) {
			this.nodes.push(this.createNode(config, options));
		}
	}

	private createNode(config: LavalinkNodeOptions, options: LavalinkExtOptions): InternalNode {
		const secure = config.secure ?? true;
		const port = config.port ?? (secure ? 443 : 2333);
		const identifier = config.identifier ?? `${config.host}:${port}`;
		const protocol = secure ? "https" : "http";
		const baseURL = `${protocol}://${config.host}:${port}`;
		const headers: Record<string, string> = {
			Authorization: config.password,
			"Client-Name": options.clientName ?? `ziplayer-extension/1.0.0`,
		};
		const rest = axios.create({
			baseURL,
			timeout: options.requestTimeoutMs ?? 10_000,
			headers,
		});
		return {
			...config,
			identifier,
			port,
			secure,
			rest,
			connected: false,
			wsConnected: false,
			lastPing: undefined,
			players: new Set<string>(),
			wsReconnectAttempts: 0,
			maxReconnectAttempts: 5,
		};
	}

	/**
	 * Initializes connections to all configured Lavalink nodes.
	 *
	 * This method tests connections to all nodes and establishes WebSocket
	 * connections for real-time event handling. It runs in parallel for
	 * all nodes to minimize initialization time.
	 *
	 * @param userId - Discord user ID of the bot
	 * @param clientName - Name to identify this client to Lavalink nodes
	 *
	 * @example
	 * ```typescript
	 * await nodeManager.initializeConnections("123456789012345678", "MyMusicBot");
	 * ```
	 */
	async initializeConnections(userId: string, clientName: string): Promise<void> {
		this.debug("Initializing node connections");

		await Promise.all(
			this.nodes.map((node) =>
				this.testNodeConnection(node, userId, clientName).catch((error) =>
					this.debug(`Failed to test node ${node.identifier}`, error),
				),
			),
		);
	}

	private async testNodeConnection(node: InternalNode, userId: string, clientName: string): Promise<void> {
		try {
			const response = await node.rest.get("/version");
			node.connected = true;
			this.debug(`Node ${node.identifier} connected successfully`);

			// Connect WebSocket to get sessionId
			await this.wsHandler.connectWebSocket(node, userId, clientName);
		} catch (error) {
			node.connected = false;
			this.debug(`Node ${node.identifier} connection failed`, error);
		}
	}

	/**
	 * Selects the best available node based on the specified strategy.
	 *
	 * This method chooses the optimal node for new players based on:
	 * - Current player count (default strategy)
	 * - CPU usage (lowest first)
	 * - Memory usage (lowest first)
	 * - Random selection
	 *
	 * @param nodeSort - Node selection strategy (default: "players")
	 * @returns The best available node, or null if no nodes are connected
	 *
	 * @example
	 * ```typescript
	 * // Select node with fewest players
	 * const node = nodeManager.selectNode("players");
	 *
	 * // Select node with lowest CPU usage
	 * const cpuNode = nodeManager.selectNode("cpu");
	 *
	 * // Select random available node
	 * const randomNode = nodeManager.selectNode("random");
	 * ```
	 */
	selectNode(nodeSort: "players" | "cpu" | "memory" | "random" = "players"): InternalNode | null {
		const connected = this.nodes.filter((node) => node.connected && node.wsConnected && node.sessionId);
		if (connected.length === 0) return null;

		switch (nodeSort) {
			case "cpu":
				connected.sort((a, b) => {
					const aLoad = a.stats?.cpu?.systemLoad ?? Number.POSITIVE_INFINITY;
					const bLoad = b.stats?.cpu?.systemLoad ?? Number.POSITIVE_INFINITY;
					return aLoad - bLoad;
				});
				break;
			case "memory":
				connected.sort((a, b) => {
					const aMem = a.stats?.memory?.used ?? Number.POSITIVE_INFINITY;
					const bMem = b.stats?.memory?.used ?? Number.POSITIVE_INFINITY;
					return aMem - bMem;
				});
				break;
			case "random":
				return connected[Math.floor(Math.random() * connected.length)];
			case "players":
			default:
				connected.sort((a, b) => a.players.size - b.players.size);
		}
		return connected[0] ?? null;
	}

	getNode(identifier: string): InternalNode | undefined {
		return this.nodes.find((node) => node.identifier === identifier);
	}

	getAllNodes(): InternalNode[] {
		return [...this.nodes];
	}

	/**
	 * Loads tracks from a Lavalink node using the specified identifier.
	 *
	 * This method queries a Lavalink node for tracks using various identifiers:
	 * - Direct URLs (YouTube, SoundCloud, etc.)
	 * - Search queries with prefixes (e.g., "ytsearch:", "scsearch:")
	 * - Track identifiers
	 *
	 * @param node - The Lavalink node to query
	 * @param identifier - Track identifier or search query
	 * @returns Track loading result from Lavalink
	 * @throws {Error} If the request fails
	 *
	 * @example
	 * ```typescript
	 * const result = await nodeManager.loadTracks(node, "ytsearch:Never Gonna Give You Up");
	 * console.log(`Found ${result.tracks.length} tracks`);
	 * ```
	 */
	async loadTracks(node: InternalNode, identifier: string): Promise<any> {
		this.debug(`Loading tracks from node ${node.identifier} identifier=${identifier}`);
		const res = await node.rest.get(`/v4/loadtracks`, { params: { identifier } }).catch((error: any) => {
			this.debug(`loadTracks request failed for ${node.identifier} id=${identifier}`, error);
			throw error;
		});
		this.debug(`loadTracks response for ${node.identifier} id=${identifier} loadType=${res.data?.loadType}`);
		return res.data;
	}

	/**
	 * Updates a player on a Lavalink node.
	 *
	 * This method sends player updates to Lavalink including:
	 * - Track changes
	 * - Volume adjustments
	 * - Pause/resume states
	 * - Position updates
	 *
	 * @param node - The Lavalink node to update the player on
	 * @param guildId - Discord guild ID of the player
	 * @param payload - Player update payload
	 *
	 * @example
	 * ```typescript
	 * await nodeManager.updatePlayer(node, "123456789", {
	 *   track: { encoded: "trackData" },
	 *   volume: 50,
	 *   paused: false
	 * });
	 * ```
	 */
	async updatePlayer(node: InternalNode, guildId: string, payload: Record<string, any>): Promise<void> {
		try {
			await node.rest.patch(`/v4/sessions/${node.sessionId}/players/${guildId}`, payload);
		} catch (error: any) {
			// Don't throw if the connection is already closed, player doesn't exist, or bad request
			if (
				error.response?.status === 404 ||
				error.response?.status === 400 ||
				error.code === "ECONNRESET" ||
				error.code === "ECONNREFUSED"
			) {
				this.debug(`Player ${guildId} not found, bad request, or connection closed, skipping update`);
				return;
			}
			throw error;
		}
	}

	async destroyPlayer(node: InternalNode, guildId: string): Promise<void> {
		try {
			await node.rest.delete(`/v4/sessions/${node.sessionId}/players/${guildId}`);
		} catch (error: any) {
			// Don't log as error if the player doesn't exist or connection is closed
			if (error.response?.status === 404 || error.code === "ECONNRESET" || error.code === "ECONNREFUSED") {
				this.debug(`Player ${guildId} already destroyed or connection closed`);
			} else {
				this.debug(`Failed to destroy Lavalink player for ${guildId}`, error);
			}
		} finally {
			node.players.delete(guildId);
		}
	}

	async getPlayerInfo(node: InternalNode, guildId: string): Promise<any> {
		const response = await node.rest.get(`/v4/sessions/${node.sessionId}/players/${guildId}`);
		return response.data;
	}

	closeAllConnections(): void {
		this.wsHandler.closeAllWebSockets(this.nodes);
	}

	// Expose WebSocket event handling
	onWebSocketEvent(event: string, callback: (node: InternalNode, data: any) => void): void {
		this.wsHandler.on(event, callback);
	}

	offWebSocketEvent(event: string, callback: (node: InternalNode, data: any) => void): void {
		this.wsHandler.off(event, callback);
	}

	destroy(): void {
		this.closeAllConnections();
		this.nodes = [];
	}
}
