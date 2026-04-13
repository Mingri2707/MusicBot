import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { PlayerManager } from "ziplayer";
import {
  SoundCloudPlugin,
  YouTubePlugin,
  SpotifyPlugin,
  AttachmentsPlugin,
} from "@ziplayer/plugin";
import SpotifyWebApi from "spotify-web-api-node";
import { YTexec } from "@ziplayer/ytexecplug";

const prefix = "k";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const player = new PlayerManager({
  plugins: [
    new YouTubePlugin({
      firstStream: new YTexec({ cookies: "./cookies.json" }).getStream, // fix stream mạnh hơn
    }),

    new SpotifyPlugin({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    }),

    new AttachmentsPlugin({
      maxFileSize: 25 * 1024 * 1024, // 25MB
    }),
  ],
});

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

// lấy access token
async function refreshSpotifyToken() {
  const data = await spotifyApi.clientCredentialsGrant();
  spotifyApi.setAccessToken(data.body.access_token);
}

// gọi lần đầu
await refreshSpotifyToken();

// refresh mỗi 50 phút
setInterval(refreshSpotifyToken, 50 * 60 * 1000);

/* ================= PLAYER EVENTS ================= */

player.on("trackStart", (queue, track) => {
  queue.userdata.channel.send({
    embeds: [
      {
        color: 0x2b2d31,
        title: "🎶 Biêu hát cho các bố nghe",
        description: `**${track.title}**`,
        thumbnail: {
          url: track.thumbnail || "https://i.imgur.com/8yKXsiR.png",
        },
      },
    ],
  });
});

player.on("trackAdd", (queue, track) => {
  queue.userdata.channel.send(`✅ Added: **${track.title}**`);
});

player.on("error", (queue, error) => {
  console.log(`[${queue?.guild?.id}] Error:`, error);
});

/* ================= READY ================= */

client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

/* ================= COMMAND ================= */

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const queue = player.get(message.guild.id);

  /* ========= PLAY ========= */
  if (command === "play") {
    if (!args[0]) return message.channel.send("❌ | Nhập tên bài hoặc link");

    if (!message.member.voice.channel)
      return message.channel.send("❌ | Vào voice trước!");

    const newQueue = await player.create(message.guild.id, {
      userdata: { channel: message.channel },
      selfDeaf: true,
    });

    try {
      if (!newQueue.connection)
        await newQueue.connect(message.member.voice.channel);

      let query = args.join(" ");

      if (query.includes("spotify.com/playlist")) {
        try {
          const playlistId = query.split("playlist/")[1].split("?")[0];

          let offset = 0;
          let allTracks = [];

          while (true) {
            const res = await spotifyApi.getPlaylistTracks(playlistId, {
              offset,
              limit: 100,
            });

            allTracks.push(...res.body.items);

            if (res.body.items.length < 100) break;
            offset += 100;
          }

          if (!allTracks.length)
            return message.channel.send("❌ Playlist rỗng");

          for (const item of allTracks) {
            const t = item.track;
            if (!t) continue;

            const searchText = `${t.name} ${t.artists[0].name}`;
            await newQueue.play(searchText);

            // chống spam request
            await new Promise((r) => setTimeout(r, 200));
          }

          return message.channel.send(
            `✅ Đã thêm playlist (${allTracks.length} bài)`,
          );
        } catch (err) {
          console.log(err);
          return message.channel.send("❌ Lỗi Spotify playlist");
        }
      }

      await newQueue.play(query);
    } catch (e) {
      console.log(e);
      return message.channel.send("❌ | Không thể phát");
    }
  } else if (command === "skip") {
    /* ========= SKIP ========= */
    if (!queue || !queue.isPlaying)
      return message.channel.send("❌ | Không có nhạc");

    queue.skip();
    message.channel.send("⏭ | Đã skip");
  } else if (command === "stop") {
    /* ========= STOP ========= */
    if (!queue) return message.channel.send("❌ | Không có nhạc");

    queue.stop();
    message.channel.send("⏹ | Đã dừng");
  } else if (command === "pause") {
    /* ========= PAUSE ========= */
    if (!queue || queue.isPaused)
      return message.channel.send("❌ | Không thể pause");

    queue.pause();
    message.channel.send("⏸ | Đã pause");
  } else if (command === "resume") {
    /* ========= RESUME ========= */
    if (!queue || !queue.isPaused)
      return message.channel.send("❌ | Không thể resume");

    queue.resume();
    message.channel.send("▶ | Tiếp tục");
  } else {
    /* ========= UNKNOWN ========= */
    message.channel.send("❌ | Lệnh không hợp lệ");
  }
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
