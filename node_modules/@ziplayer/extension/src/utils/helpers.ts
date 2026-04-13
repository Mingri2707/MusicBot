import type { Track } from "ziplayer";

export const isTrack = (value: any): value is Track => value && typeof value === "object" && typeof value.title === "string";

export const isUrl = (value: string): boolean => {
	// Kiểm tra URL cơ bản
	if (!/^(https?:\/\/|wss?:\/\/)/i.test(value)) return false;

	try {
		// Kiểm tra các domain phổ biến cho music
		const musicDomains = [
			"youtube.com",
			"youtu.be",
			"m.youtube.com",
			"soundcloud.com",
			"m.soundcloud.com",
			"spotify.com",
			"open.spotify.com",
			"bandcamp.com",
			"music.apple.com",
			"twitch.tv",
			"vimeo.com",
		];

		const url = new URL(value);
		return musicDomains.some((domain) => url.hostname === domain || url.hostname.endsWith("." + domain));
	} catch {
		// Nếu không parse được URL thì không phải URL hợp lệ
		return false;
	}
};

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const getEncoded = (track: Track | null | undefined): string | null => {
	if (!track) return null;
	const encoded = (track as any)?.metadata?.lavalink?.encoded;
	return typeof encoded === "string" ? encoded : null;
};

export const createDebugLogger = (debug: boolean, prefix: string) => {
	return (message: string, ...optional: any[]) => {
		if (!debug) return;
		const formatted = `[${prefix}] ${message}`;
		console.log(formatted, ...optional);
	};
};
