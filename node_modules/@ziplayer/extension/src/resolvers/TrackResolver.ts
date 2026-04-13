import type { Track, SearchResult } from "ziplayer";
import type { LavalinkRawTrack, LavalinkPlaylistData, LavalinkLoadResponse, InternalNode } from "../types/lavalink";
import { isUrl, getEncoded } from "../utils/helpers";

export class TrackResolver {
	private debug: (message: string, ...optional: any[]) => void;

	constructor(debug: boolean) {
		this.debug = (message: string, ...optional: any[]) => {
			if (!debug) return;
			const formatted = `[TrackResolver] ${message}`;
			console.log(formatted, ...optional);
		};
	}

	mapToTrack(raw: LavalinkRawTrack, requestedBy: string): Track {
		const track: Track = {
			id: raw.info.identifier,
			title: raw.info.title,
			url: raw.info.uri ?? raw.info.identifier,
			duration: raw.info.length ?? 0,
			thumbnail: raw.info.artworkUrl ?? undefined,
			requestedBy,
			source: raw.info.sourceName ?? "lavalink",
			metadata: {
				lavalink: {
					encoded: raw.encoded,
					info: raw.info,
					pluginInfo: raw.pluginInfo ?? {},
					node: null,
				},
			},
		};
		return track;
	}

	resolveTrackFromLavalink(player: any, raw: LavalinkRawTrack): Track | null {
		if (!raw) return null;
		const current = player.queue.currentTrack;
		if (current && getEncoded(current) === raw.encoded) return current;
		const upcoming = player.queue.getTracks();
		for (const track of [current, ...upcoming]) {
			if (track && getEncoded(track) === raw.encoded) return track;
		}
		return {
			id: raw.info.identifier,
			title: raw.info.title,
			url: raw.info.uri ?? raw.info.identifier,
			duration: raw.info.length ?? 0,
			thumbnail: raw.info.artworkUrl ?? undefined,
			requestedBy: current?.requestedBy ?? "Unknown",
			source: raw.info.sourceName ?? "lavalink",
			metadata: {
				...(current?.metadata ?? {}),
				lavalink: {
					encoded: raw.encoded,
					info: raw.info,
					pluginInfo: raw.pluginInfo,
					node: current?.metadata?.lavalink?.node ?? null,
				},
			},
		};
	}

	async ensureTrackEncoded(player: any, track: Track, requestedBy: string, nodeManager: any): Promise<void> {
		if (getEncoded(track)) return;
		const node = nodeManager.selectNode();
		if (!node) throw new Error("No Lavalink nodes available");

		// Nếu track.url là URL thì sử dụng trực tiếp, không thêm search prefix
		const identifier = track.url && isUrl(track.url) ? track.url : track.id || track.title;
		if (!identifier) throw new Error("Cannot resolve track identifier for Lavalink");

		this.debug(`Ensuring track encoded with identifier: ${identifier} (isUrl: ${isUrl(identifier)})`);

		const response = await nodeManager.loadTracks(node, identifier);

		// Kiểm tra response type
		if (response.loadType === "error") {
			const errorData = response.data as { message?: string; severity?: string } | null;
			throw new Error(errorData?.message ?? "Lavalink error");
		}

		if (response.loadType === "empty") {
			throw new Error("Track not found on Lavalink");
		}

		const raws =
			Array.isArray(response.data) ? response.data : ((response.data as LavalinkPlaylistData | undefined)?.tracks ?? []);
		const raw = raws[0];
		if (!raw) throw new Error("Track not found on Lavalink");
		const mapped = this.mapToTrack(raw, requestedBy);
		track.metadata = mapped.metadata;
	}

	async resolvePlayRequest(
		player: any,
		query: string | Track,
		requestedBy: string,
		nodeManager: any,
		searchPrefix: string = "ytsearch",
	): Promise<{ tracks: Track[]; isPlaylist: boolean }> {
		if (typeof query === "string") {
			const result = await this.searchLavalink(query, requestedBy, nodeManager, searchPrefix);
			const mapped = result.tracks.map((track) => ({
				...track,
				requestedBy,
			}));
			return { tracks: mapped, isPlaylist: !!result.playlist };
		}

		// Handle Track object
		if (query && typeof query === "object" && typeof query.title === "string") {
			const clone: Track = {
				...query,
				requestedBy: query.requestedBy ?? requestedBy,
				metadata: { ...(query.metadata ?? {}) },
			};
			await this.ensureTrackEncoded(player, clone, requestedBy, nodeManager);
			return { tracks: [clone], isPlaylist: false };
		}

		throw new Error("Invalid play request");
	}

	async searchLavalink(
		query: string,
		requestedBy: string,
		nodeManager: any,
		searchPrefix: string = "ytsearch",
	): Promise<SearchResult> {
		const node = nodeManager.selectNode();
		if (!node) throw new Error("No Lavalink nodes connected");

		// Nếu query là URL thì sử dụng trực tiếp, không thêm search prefix
		// Theo https://github.com/lavalink-devs/Lavalink/discussions/840
		const identifier = isUrl(query) ? query : `${searchPrefix}:${query}`;
		this.debug(`Searching with identifier: ${identifier} (isUrl: ${isUrl(query)})`);

		const response = await nodeManager.loadTracks(node, identifier);

		if (!response) throw new Error("Invalid response from Lavalink");
		switch (response.loadType) {
			case "error": {
				const data = response.data as { message?: string; severity?: string } | null;
				throw new Error(data?.message ?? "Lavalink error");
			}
			case "empty":
				throw new Error("No tracks found");
			case "playlist": {
				const playlist = response.data as LavalinkPlaylistData;
				const tracks = playlist.tracks.map((raw) => this.mapToTrack(raw, requestedBy));
				return {
					tracks,
					playlist: {
						name: playlist.info?.name ?? "Playlist",
						url: playlist.info?.url ?? identifier,
						thumbnail: playlist.info?.artworkUrl ?? undefined,
					},
				};
			}
			case "track": {
				const raw = Array.isArray(response.data) ? (response.data as LavalinkRawTrack[])[0] : null;
				if (!raw) throw new Error("No track data received");
				return { tracks: [this.mapToTrack(raw, requestedBy)] };
			}
			case "search":
			default: {
				const list = Array.isArray(response.data) ? (response.data as LavalinkRawTrack[]) : [];
				const tracks = list.map((raw) => this.mapToTrack(raw, requestedBy));
				return { tracks };
			}
		}
	}
}
