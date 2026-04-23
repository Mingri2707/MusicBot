import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { PlayerManager } from "ziplayer";
import {
  SoundCloudPlugin,
  YouTubePlugin,
  SpotifyPlugin,
  AttachmentsPlugin,
} from "@ziplayer/plugin";
import SpotifyWebApi from "spotify-web-api-node";
import { YTexec } from "@ziplayer/ytexecplug";
import spotifyUrlInfo from "spotify-url-info";
import fetch from "node-fetch";

const { getData, getPreview, getTracks } = spotifyUrlInfo(fetch);

const spotifyFetch = (url) => fetch(url).then((r) => r.json());

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
      firstStream: new YTexec().getStream, // fix stream mạnh hơn
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

function findChannel(guild, name) {
  return guild.channels.cache.find((c) => c.name === name && c.isTextBased());
}

client.on("guildMemberAdd", async (member) => {
  const guild = member.guild;

  // 🔎 tìm channel theo tên
  const chung = findChannel(guild, "chung");
  const rules = findChannel(guild, "rules");
  const nhac = findChannel(guild, "nhạc");

  const channel = chung || guild.systemChannel; // fallback

  if (!channel) return;
  const eServer = "<a:server:123456789012345678>";
  const eChat = "<a:chat:123456789012345678>";
  const eRule = "<a:rule:123456789012345678>";
  const eMusic = "<a:music:123456789012345678>";

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({
      name: "you need to eat potatoes",
      iconURL: guild.iconURL(),
    })
    .setTitle(`WELCOME`)
    .setDescription(
      `👉 Server: ${chung ? `<#${chung.id}>` : "#chung"}\n\n` +
        `📌 nói xàm lồn: ${chung ? `<#${chung.id}>` : "#chung"}\n` +
        `📜 luật: ${rules ? `<#${rules.id}>` : "#rules"}\n` +
        `🎵 mở nhạc: ${nhac ? `<#${nhac.id}>` : "#nhac"}\n\n` +
        `you need to eat potatoes`,
    )
    .setThumbnail(member.user.displayAvatarURL());

  channel.send({
    content: `Chào mừng <@${member.id}> đến với server ${member.guild.name}`,
    embeds: [embed],
  });
});

client.on("guildMemberRemove", async (member) => {
  const guild = member.guild;

  const chung = findChannel(guild, "chung");
  const rules = findChannel(guild, "rules");
  const nhac = findChannel(guild, "nhac");

  const channel = chung || guild.systemChannel;
  if (!channel) return;

  const eServer = "<a:server:123456789012345678>";
  const eChat = "<a:chat:123456789012345678>";
  const eRule = "<a:rule:123456789012345678>";
  const eMusic = "<a:music:123456789012345678>";

  const embed = new EmbedBuilder()
    .setColor(0xff4d4d)
    .setAuthor({
      name: "you need to eat potatoes",
      iconURL: guild.iconURL(),
    })
    .setTitle(`GOODBYE`)
    .setDescription(
      `Cút mẹ mày đi` +
        `${eServer}👉 Server: ${chung ? `<#${chung.id}>` : "#chung"}\n\n` +
        `📌 nói xàm lồn: ${chung ? `<#${chung.id}>` : "#chung"}\n` +
        `📜 luật: ${rules ? `<#${rules.id}>` : "#rules"}\n` +
        `🎵 mở nhạc: ${nhac ? `<#${nhac.id}>` : "#nhac"}\n\n` +
        `you need to eat potatoes`,
    )
    .setThumbnail(member.user.displayAvatarURL());

  channel.send({
    content: `Cảm ơn <@${member.id}> đã cook khỏi server ${member.guild.name}`,
    embeds: [embed],
  });
});

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

      const query = args.join(" ");

      // Xử lý Spotify playlist không cần API key
      if (query.includes("spotify.com/playlist")) {
        try {
          const tracks = await getTracks(query);

          if (!tracks?.length)
            return message.channel.send("❌ Playlist rỗng hoặc không đọc được");

          message.channel.send(
            `⏳ Đang thêm **${tracks.length}** bài vào queue...`,
          );

          for (const track of tracks) {
            // Build query chuẩn hơn để YouTube tìm đúng bài
            const searchText = `${track.name} ${track.artist} official audio`;
            try {
              await newQueue.play(searchText);
            } catch (e) {
              console.log(`[Skip] ${searchText}:`, e.message);
            }
            await new Promise((r) => setTimeout(r, 300));
          }

          return message.channel.send(`✅ Đã thêm **${tracks.length}** bài`);
        } catch (err) {
          console.log("[Spotify Playlist]", err);
          return message.channel.send(
            `❌ Lỗi đọc playlist: ${err?.message ?? err}`,
          );
        }
      }

      // Spotify track đơn
      if (query.includes("spotify.com/track")) {
        try {
          const preview = await getPreview(query);
          const searchText = `${preview.title} ${preview.artist} official audio`;
          return await newQueue.play(searchText);
        } catch (err) {
          console.log("[Spotify Track]", err);
          return message.channel.send("❌ Không đọc được track Spotify");
        }
      }

      // YouTube link hoặc tìm theo tên
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
