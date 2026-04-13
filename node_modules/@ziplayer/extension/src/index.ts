/**
 * @fileoverview Main export file for ZiPlayer extensions.
 *
 * This module exports all available extensions and supporting classes for the ZiPlayer
 * music bot framework. Extensions provide additional functionality beyond basic
 * audio playback, such as Lavalink integration, voice recognition, and lyrics fetching.
 *
 * @example
 * ```typescript
 * import { lavalinkExt, voiceExt, lyricsExt, NodeManager } from "ziplayer/extension";
 *
 * const manager = new PlayerManager({
 *   extensions: [
 *     new lavalinkExt(null, {
 *       nodes: [{ host: "localhost", port: 2333, password: "youshallnotpass" }]
 *     }),
 *     new voiceExt(null, { lang: "en-US" }),
 *     new lyricsExt(null, { provider: "lrclib" })
 *   ]
 * });
 * ```
 *
 * @since 1.0.0
 */

/**
 * Lavalink extension for high-performance audio streaming.
 *
 * Provides integration with Lavalink nodes for:
 * - High-quality audio streaming with low latency
 * - Advanced audio processing and effects
 * - Load balancing across multiple nodes
 * - WebSocket-based real-time updates
 *
 * @example
 * ```typescript
 * const lavalinkExt = new lavalinkExt(null, {
 *   nodes: [{ host: "localhost", port: 2333, password: "youshallnotpass" }]
 * });
 * ```
 */
export { lavalinkExt } from "./lavalinkExt";

/**
 * Voice extension for real-time speech recognition.
 *
 * Provides voice-to-text functionality including:
 * - Real-time speech recognition in Discord voice channels
 * - Multiple language support
 * - Custom speech resolver support
 * - Audio quality filtering
 *
 * @example
 * ```typescript
 * const voiceExt = new voiceExt(null, {
 *   lang: "en-US",
 *   ignoreBots: true
 * });
 * ```
 */
export { voiceExt } from "./voiceExt";

/**
 * Lyrics extension for automatic lyrics fetching and synchronization.
 *
 * Provides lyrics functionality including:
 * - Automatic lyrics fetching from multiple providers
 * - LRC (synchronized) lyrics support
 * - Real-time line-by-line updates
 * - Title sanitization for better matching
 *
 * @example
 * ```typescript
 * const lyricsExt = new lyricsExt(null, {
 *   provider: "lrclib",
 *   includeSynced: true
 * });
 * ```
 */
export { lyricsExt } from "./lyricsExt";

/**
 * NodeManager for managing Lavalink node connections.
 *
 * Handles:
 * - Connection management to multiple Lavalink nodes
 * - Load balancing and node selection
 * - REST API operations
 * - WebSocket event handling
 *
 * @example
 * ```typescript
 * const nodeManager = new NodeManager({
 *   nodes: [{ host: "localhost", port: 2333, password: "youshallnotpass" }]
 * });
 * ```
 */
export { NodeManager } from "./managers/NodeManager";

/**
 * PlayerStateManager for managing player states and voice connections.
 *
 * Handles:
 * - Player state tracking and synchronization
 * - Voice connection state management
 * - Voice server and state update handling
 * - Player-to-node mapping
 *
 * @example
 * ```typescript
 * const stateManager = new PlayerStateManager(true);
 * stateManager.attachPlayer(player);
 * ```
 */
export { PlayerStateManager } from "./managers/PlayerStateManager";

/**
 * WebSocketHandler for managing WebSocket connections to Lavalink nodes.
 *
 * Handles:
 * - WebSocket connection management
 * - Event handling and routing
 * - Automatic reconnection
 * - Connection state tracking
 */
export { WebSocketHandler } from "./handlers/WebSocketHandler";

/**
 * VoiceHandler for managing voice connection operations.
 *
 * Handles:
 * - Voice connection establishment
 * - Voice server and state updates
 * - Gateway payload sending
 * - Connection state management
 */
export { VoiceHandler } from "./handlers/VoiceHandler";

/**
 * TrackResolver for resolving and encoding tracks for Lavalink.
 *
 * Handles:
 * - Track resolution from various sources
 * - Track encoding for Lavalink compatibility
 * - Search functionality
 * - Track metadata processing
 */
export { TrackResolver } from "./resolvers/TrackResolver";

/**
 * Utility functions and helpers for extensions.
 *
 * Provides:
 * - Debug logging utilities
 * - Track encoding/decoding helpers
 * - Common utility functions
 * - Type checking helpers
 */
export * from "./utils/helpers";

/**
 * Type definitions for Lavalink integration.
 *
 * Includes:
 * - Lavalink node configuration types
 * - Player state types
 * - Voice connection types
 * - Extension option types
 */
export * from "./types/lavalink";
