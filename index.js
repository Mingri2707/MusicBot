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
  console.log("[trackStart] fired:", track?.title);
  console.log("[trackStart] channel:", queue?.userdata?.channel?.name); // 👈 thêm
  console.log("[trackStart] channel id:", queue?.userdata?.channel?.id);
  queue.userdata.currentTrack = track;
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

// trackEnd tự động chuyển bài tiếp theo trong playlist
player.on("trackEnd", async (queue, track) => {
  if (!queue?.userdata) return;
  if (queue.userdata.stopped) return;

  const playlist = queue.userdata.playlist;
  if (!playlist?.length) return; // không có playlist thì thôi

  const mode = queue.userdata.repeatMode ?? 0;
  let nextIndex = (queue.userdata.playlistIndex ?? 0) + 1;

  if (mode === 1) {
    // Repeat 1 bài — play lại đúng bài đó
    const current = playlist[queue.userdata.playlistIndex];
    const searchText = `${current.name} ${current.artist} official audio`;
    return await queue.play(searchText);
  }

  if (mode === 2) {
    // Repeat queue — quay về đầu khi hết
    if (nextIndex >= playlist.length) nextIndex = 0;
  } else {
    // Không repeat — hết thì thôi
    if (nextIndex >= playlist.length) {
      queue.userdata.playlist = null;
      return;
    }
  }

  queue.userdata.playlistIndex = nextIndex;
  const next = playlist[nextIndex];
  const searchText = `${next.name} ${next.artist} official audio`;
  await queue.play(searchText).catch(console.error);
});

// const originalEmit = player.emit.bind(player);
// player.emit = (event, ...args) => {
//   console.log("[PLAYER EVENT]", event);
//   return originalEmit(event, ...args);
// };

/* ================= READY ================= */

client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

/* ================= COMMAND ================= */

function findChannel(guild, name) {
  return guild.channels.cache.find((c) => c.name === name && c.isTextBased());
}

client.on("voiceStateUpdate", (oldState, newState) => {
  // Chỉ quan tâm khi chính bot rời voice
  if (oldState.member.id !== client.user.id) return;
  if (!oldState.channelId || newState.channelId) return; // bot phải đang rời (có channel cũ, không có channel mới)

  const guild = oldState.guild;
  const musicChannel = findChannel(guild, "nhạc-nhiếc-ồn-vãi-l");
  if (!musicChannel) return;

  // Reset queue nếu còn
  const queue = player.get(guild.id);
  if (queue) {
    queue.userdata.stopped = true;
    queue.userdata.playlist = null;
  }

  musicChannel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff4d4d)
        .setTitle("👋 Bot đã rời voice")
        .setDescription(`Bot đã rời khỏi **${oldState.channel?.name}**`)
        .setTimestamp(),
    ],
  });
});

client.on("guildMemberAdd", async (member) => {
  const guild = member.guild;
  const welcome = findChannel(guild, "welcome");
  // 🔎 tìm channel theo tên
  const noixamlol = findChannel(guild, "xam-l-ba-hoa");
  const rules = findChannel(guild, "rule");
  const nhac = findChannel(guild, "nhạc-nhiếc-ồn-vãi-l");

  const channel = welcome || guild.systemChannel; // fallback

  if (!channel) return;
  const eChat = "<a:idk:1253523454548901958>";
  const eRule = "<a:bongocat:1253523428170924092>";
  const eMusic = "<a:Pepe_Shoot:1253523483468501032> ";
  const eSheep = "<a:sheep:1253523509720911996>";

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({
      name: "you need to eat potatoes",
      iconURL: guild.iconURL(),
    })
    .setTitle(`WELCOME`)
    .setDescription(
      `${eChat} nơi xàm lồn: ${noixamlol ? `<#${noixamlol.id}>` : "#noixamlol"}\n` +
        `${eRule}: ${rules ? `<#${rules.id}>` : "#rules"}\n` +
        `${eMusic} mở nhạc: ${nhac ? `<#${nhac.id}>` : "#nhac"}\n\n` +
        `${eSheep}you need to eat potatoes`,
    )
    .setThumbnail(member.user.displayAvatarURL());

  channel.send({
    content: `Chào mừng <@${member.id}> đến với server ${member.guild.name}`,
    embeds: [embed],
  });
});

client.on("guildMemberRemove", async (member) => {
  const guild = member.guild;
  const goodbye = findChannel(guild, "cút");

  const channel = goodbye || guild.systemChannel;
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0xff4d4d)
    .setAuthor({
      name: "you need to eat potatoes",
      iconURL: guild.iconURL(),
    })
    .setTitle(`GOODBYE`)
    .setDescription(`CÚT MẸ MÀY ĐI\n\n` + `you need to eat potatoes`)
    .setThumbnail(member.user.displayAvatarURL());

  channel.send({
    content: `Cảm ơn <@${member.id}> đã cook khỏi server ${member.guild.name}`,
    embeds: [embed],
  });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(prefix)) return;
  const musicChannel = findChannel(message.guild, "nhạc-nhiếc-ồn-vãi-l");

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const queue = player.get(message.guild.id);

  /* ========= PLAY ========= */
  if (command === "play") {
    if (!args[0]) return message.channel.send("❌ | Nhập tên bài hoặc link");
    if (!message.member.voice.channel)
      return message.channel.send("❌ | Vào voice trước!");

    const newQueue = await player.create(message.guild.id, {
      userdata: {
        channel: musicChannel || message.channel,
      },
      selfDeaf: true,
    });
    // console.log("Queue keys:", Object.keys(newQueue));
    // console.log(
    //   "Queue proto methods:",
    //   Object.getOwnPropertyNames(Object.getPrototypeOf(newQueue)),
    // );
    try {
      if (!newQueue.connection)
        await newQueue.connect(message.member.voice.channel);

      const query = args.join(" ");

      // Xử lý Spotify playlist không cần API key
      if (query.includes("spotify.com/playlist")) {
        const tracks = await getTracks(query);
        if (!tracks?.length) return message.channel.send("❌ Playlist rỗng");

        // Lưu playlist vào userdata
        newQueue.userdata.playlist = tracks;
        newQueue.userdata.playlistIndex = 0;

        message.channel.send(
          `⏳ Đã load **${tracks.length}** bài, đang phát...`,
        );

        // Chỉ play bài đầu tiên
        const first = tracks[0];
        const searchText = `${first.name} ${first.artist} official audio`;
        await newQueue.play(searchText);
        return;
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
    if (!queue || !queue.isPlaying)
      return message.channel.send("❌ | Không có nhạc");

    queue.skip(); // ✅ chỉ skip thôi, để trackEnd tự tăng index
    message.channel.send("⏭ | Đã skip");
  } else if (command === "stop") {
    /* ========= STOP ========= */
    if (!queue) return message.channel.send("❌ | Không có nhạc");

    queue.loop(0); // 👈 tắt repeat trước
    queue.stop();
    message.channel.send("⏹ | Đã dừng");
  } else if (command === "pause") {
    /* ========= PAUSE ========= */
    if (!queue || queue.isPaused)
      return message.channel.send("❌ | Không thể pause");

    queue.pause();
    message.channel.send("⏸ | Đã pause");
  } else if (command === "repeat") {
    if (!queue || !queue.isPlaying)
      return message.channel.send("❌ | Không có nhạc");

    const mode = args[0];
    if (!["1", "2", "3"].includes(mode))
      return message.channel.send("📖 1: Tắt | 2: Lặp 1 bài | 3: Lặp cả queue");

    if (mode === "1") {
      queue.loop(0); // tắt
      return message.channel.send("❌ Đã tắt repeat");
    }
    if (mode === "2") {
      queue.loop(1); // repeat 1 bài
      return message.channel.send("🔂 Đang lặp lại bài hiện tại");
    }
    if (mode === "3") {
      queue.loop(2); // repeat queue
      return message.channel.send("🔁 Đang lặp lại toàn bộ queue");
    }
  } else if (command === "resume") {
    /* ========= RESUME ========= */
    if (!queue || !queue.isPaused)
      return message.channel.send("❌ | Không thể resume");

    queue.resume();
    message.channel.send("▶ | Tiếp tục");
  } else if (command === "help") {
    const helpEmbed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle("📜 Hướng dẫn sử dụng bot nhạc")
      .setDescription("Dưới đây là các lệnh bạn có thể sử dụng:")
      .addFields(
        {
          name: "kplay <tên bài/ link>",
          value: "▶ Phát nhạc từ YouTube hoặc Spotify",
        },
        { name: "kskip", value: "⏭ Bỏ qua bài hiện tại" },
        { name: "kstop", value: "⏹ Dừng phát nhạc và xóa queue" },
        { name: "kpause", value: "⏸ Tạm dừng bài đang phát" },
        { name: "kresume", value: "▶ Tiếp tục bài đang tạm dừng" },
        {
          name: "krepeat <1|2|3>",
          value: "🔁 1: tắt repeat, 2: repeat 1 bài, 3: repeat toàn bộ queue",
        },
        { name: "khelp", value: "📖 Hiển thị bảng hướng dẫn lệnh này" },
      )
      .setFooter({ text: "Bạn cần vào kênh voice trước khi dùng lệnh nhạc" })
      .setTimestamp();

    message.channel.send({ embeds: [helpEmbed] });
  } else {
    /* ========= UNKNOWN ========= */
    message.channel.send("❌ | Lệnh không hợp lệ");
  }
});

client.on("guildDelete", (guild) => {
  console.log(`❌ Bot đã rời server: ${guild.name} (ID: ${guild.id})`);

  // Tìm kênh theo tên
  const logChannel = client.channels.cache.find(
    (c) => c.name === "nhạc-nhiếc-ồn-vãi-l" && c.isTextBased(),
  );
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setColor(0xff4d4d)
    .setTitle("Bot rời server")
    .setDescription(`Bố cook nhé các con`)
    .setTimestamp();

  logChannel.send({ embeds: [embed] });
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
