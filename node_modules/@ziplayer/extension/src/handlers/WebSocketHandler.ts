import WebSocket from "ws";
import type {
	InternalNode,
	LavalinkWebSocketMessage,
	LavalinkReadyMessage,
	LavalinkStatsMessage,
	LavalinkPlayerUpdateMessage,
	LavalinkEventMessage,
} from "../types/lavalink";

export class WebSocketHandler {
	private debug: (message: string, ...optional: any[]) => void;
	private eventCallbacks: Map<string, ((node: InternalNode, data: any) => void)[]> = new Map();

	constructor(debug: boolean) {
		this.debug = (message: string, ...optional: any[]) => {
			if (!debug) return;
			const formatted = `[WebSocketHandler] ${message}`;
			console.log(formatted, ...optional);
		};
	}

	async connectWebSocket(node: InternalNode, userId: string, clientName: string): Promise<void> {
		if (!userId) {
			throw new Error("User ID is required for WebSocket connection");
		}

		const secure = node.secure ?? true;
		const port = node.port ?? (secure ? 443 : 2333);
		const wsProtocol = secure ? "wss" : "ws";
		const wsURL = `${wsProtocol}://${node.host}:${port}/v4/websocket`;

		const headers = {
			Authorization: node.password,
			"User-Id": userId,
			"Client-Name": clientName,
			...(node.sessionId && { "Session-Id": node.sessionId }),
		};

		return new Promise((resolve, reject) => {
			const ws = new WebSocket(wsURL, { headers });
			node.ws = ws;

			ws.on("open", () => {
				this.debug(`WebSocket connected to ${node.identifier}`);
				node.wsConnected = true;
				node.wsReconnectAttempts = 0;
			});

			ws.on("message", (data: Buffer) => {
				try {
					const message = JSON.parse(data.toString()) as LavalinkWebSocketMessage;
					this.handleWebSocketMessage(node, message);
				} catch (error) {
					this.debug(`Failed to parse WebSocket message from ${node.identifier}`, error);
				}
			});

			ws.on("close", (code: number, reason: Buffer) => {
				this.debug(`WebSocket closed for ${node.identifier}: ${code} ${reason.toString()}`);
				node.wsConnected = false;
				node.ws = undefined;

				// Auto-reconnect if not manually closed
				if (code !== 1000 && node.wsReconnectAttempts < node.maxReconnectAttempts) {
					node.wsReconnectAttempts++;
					this.debug(
						`Attempting to reconnect WebSocket for ${node.identifier} (${node.wsReconnectAttempts}/${node.maxReconnectAttempts})`,
					);
					setTimeout(() => {
						this.connectWebSocket(node, userId, clientName).catch((error) =>
							this.debug(`WebSocket reconnection failed for ${node.identifier}`, error),
						);
					}, 5000 * node.wsReconnectAttempts);
				}
			});

			ws.on("error", (error: Error) => {
				this.debug(`WebSocket error for ${node.identifier}`, error);
				node.wsConnected = false;
				reject(error);
			});

			// Resolve after ready event is received
			const originalHandleMessage = this.handleWebSocketMessage.bind(this);
			this.handleWebSocketMessage = (node: InternalNode, message: LavalinkWebSocketMessage) => {
				if (message.op === "ready") {
					resolve();
				}
				originalHandleMessage(node, message);
			};
		});
	}

	private handleWebSocketMessage(node: InternalNode, message: LavalinkWebSocketMessage): void {
		switch (message.op) {
			case "ready": {
				const readyMsg = message as LavalinkReadyMessage;
				node.sessionId = readyMsg.sessionId;
				this.debug(`Node ${node.identifier} session ready: ${readyMsg.sessionId} (resumed: ${readyMsg.resumed})`);
				break;
			}
			case "stats": {
				const statsMsg = message as LavalinkStatsMessage;
				node.stats = {
					players: statsMsg.players,
					playingPlayers: statsMsg.playingPlayers,
					uptime: statsMsg.uptime,
					memory: statsMsg.memory,
					cpu: statsMsg.cpu,
					frameStats: statsMsg.frameStats,
				};
				this.debug(`Node ${node.identifier} stats updated`, node.stats);
				break;
			}
			case "playerUpdate": {
				const playerUpdateMsg = message as LavalinkPlayerUpdateMessage;
				this.handlePlayerUpdate(node, playerUpdateMsg);
				break;
			}
			case "event": {
				const eventMsg = message as LavalinkEventMessage;
				this.handleLavalinkEvent(node, eventMsg);
				break;
			}
			default:
				this.debug(`Unknown WebSocket message type: ${message.op}`);
		}
	}

	private handlePlayerUpdate(node: InternalNode, message: LavalinkPlayerUpdateMessage): void {
		this.debug(`Player update for guild ${message.guildId} on node ${node.identifier}`);
		this.emit("playerUpdate", node, message);
	}

	private handleLavalinkEvent(node: InternalNode, message: LavalinkEventMessage): void {
		this.debug(`Lavalink event ${message.type} for guild ${message.guildId} on node ${node.identifier}`);
		this.emit("event", node, message);
		this.emit(message.type, node, message);
	}

	closeWebSocket(node: InternalNode): void {
		if (node.ws) {
			// Close with a different code to indicate graceful shutdown
			node.ws.close(1001, "Extension destroyed");
			node.ws = undefined;
			node.wsConnected = false;
		}
	}

	closeAllWebSockets(nodes: InternalNode[]): void {
		for (const node of nodes) {
			this.closeWebSocket(node);
		}
	}

	// Event callback system
	on(event: string, callback: (node: InternalNode, data: any) => void): void {
		if (!this.eventCallbacks.has(event)) {
			this.eventCallbacks.set(event, []);
		}
		this.eventCallbacks.get(event)!.push(callback);
	}

	off(event: string, callback: (node: InternalNode, data: any) => void): void {
		const callbacks = this.eventCallbacks.get(event);
		if (callbacks) {
			const index = callbacks.indexOf(callback);
			if (index > -1) {
				callbacks.splice(index, 1);
			}
		}
	}

	private emit(event: string, node: InternalNode, data: any): void {
		const callbacks = this.eventCallbacks.get(event);
		if (callbacks) {
			for (const callback of callbacks) {
				try {
					callback(node, data);
				} catch (error) {
					this.debug(`Error in event callback for ${event}`, error);
				}
			}
		}
	}
}
