// Watch Together - Socket.IO Server
// Run: node server/socket-server.js
// PM2: pm2 start server/socket-server.js --name kino-socket

const { Server } = require("socket.io");
const http = require("http");

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", rooms: rooms.size, uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// In-memory room storage
const rooms = new Map();
// socket.id -> roomCode mapping
const socketRooms = new Map();

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function cleanupRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    // Remove rooms older than 6 hours or empty for 5 min
    if (now - room.createdAt > 6 * 3600000) {
      rooms.delete(code);
      console.log(`[cleanup] Room ${code} expired`);
    } else if (room.members.length === 0 && now - room.lastActivity > 300000) {
      rooms.delete(code);
      console.log(`[cleanup] Room ${code} empty, removed`);
    }
  }
}

setInterval(cleanupRooms, 60000);

io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  // === CREATE ROOM ===
  socket.on("create-room", (data, callback) => {
    try {
      const code = generateCode();
      const member = {
        id: socket.id,
        name: data.name || "Host",
        isReady: false,
        isHost: true,
      };

      const room = {
        code,
        hostId: socket.id,
        movieId: data.movieId,
        movieTitle: data.movieTitle,
        moviePoster: data.moviePoster || null,
        movieType: data.movieType || "movie",
        movieYear: data.movieYear || "",
        state: "lobby",
        currentTime: 0,
        lastSyncAt: Date.now(),
        streamUrl: "",
        quality: "",
        streams: {},
        translatorId: null,
        translators: [],
        isSeries: data.isSeries || false,
        season: 1,
        episode: 1,
        members: [member],
        messages: [],
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };

      rooms.set(code, room);
      socketRooms.set(socket.id, code);
      socket.join(code);

      console.log(`[room] ${data.name} created room ${code} for "${data.movieTitle}"`);
      callback({ code });
    } catch (e) {
      console.error("[create-room error]", e);
      callback({ error: "Failed to create room" });
    }
  });

  // === JOIN ROOM ===
  socket.on("join-room", (data, callback) => {
    try {
      const code = (data.code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room) return callback({ error: "Комната не найдена" });
      if (room.members.length >= 10) return callback({ error: "Комната заполнена" });
      if (room.members.find((m) => m.id === socket.id)) return callback({ room });

      // If room has no host (creator reconnecting after navigation), make this person host
      const shouldBeHost = !room.hostId || room.members.length === 0;
      const member = {
        id: socket.id,
        name: data.name || "Guest",
        isReady: false,
        isHost: shouldBeHost,
      };
      if (shouldBeHost) room.hostId = socket.id;

      room.members.push(member);
      room.lastActivity = Date.now();
      socketRooms.set(socket.id, code);
      socket.join(code);

      // Notify others
      socket.to(code).emit("member-joined", { member });

      // System message
      const sysMsg = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        author: "system",
        text: `${data.name} присоединился`,
        timestamp: Date.now(),
        type: "system",
      };
      room.messages.push(sysMsg);
      io.to(code).emit("chat-message", sysMsg);

      console.log(`[room] ${data.name} joined room ${code}`);
      callback({ room });
    } catch (e) {
      console.error("[join-room error]", e);
      callback({ error: "Failed to join room" });
    }
  });

  // === LEAVE ROOM ===
  socket.on("leave-room", () => {
    handleLeave(socket);
  });

  // === PLAYER CONTROLS ===
  socket.on("player-play", (data) => {
    const code = socketRooms.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;

    room.state = "playing";
    room.currentTime = data.time;
    room.lastActivity = Date.now();
    const member = room.members.find((m) => m.id === socket.id);
    socket.to(code).emit("player-play", { time: data.time, by: member?.name || "?" });
  });

  socket.on("player-pause", (data) => {
    const code = socketRooms.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;

    room.state = "paused";
    room.currentTime = data.time;
    room.lastActivity = Date.now();
    const member = room.members.find((m) => m.id === socket.id);
    socket.to(code).emit("player-pause", { time: data.time, by: member?.name || "?" });
  });

  socket.on("player-seek", (data) => {
    const code = socketRooms.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;

    room.currentTime = data.time;
    room.lastActivity = Date.now();
    const member = room.members.find((m) => m.id === socket.id);
    socket.to(code).emit("player-seek", { time: data.time, by: member?.name || "?" });
  });

  socket.on("player-ready", () => {
    const code = socketRooms.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;

    const member = room.members.find((m) => m.id === socket.id);
    if (member) member.isReady = true;

    socket.to(code).emit("member-ready", { memberId: socket.id });

    // Check if all ready
    if (room.members.every((m) => m.isReady)) {
      io.to(code).emit("all-ready");
      console.log(`[room] All members ready in ${code}`);
    }
  });

  socket.on("player-buffering", (data) => {
    const code = socketRooms.get(socket.id);
    if (!code) return;
    socket.to(code).emit("member-buffering", { memberId: socket.id, buffering: data.buffering });
  });

  // === SYNC HEARTBEAT (host only, every 5s) ===
  socket.on("sync-heartbeat", (data) => {
    const code = socketRooms.get(socket.id);
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;

    room.currentTime = data.time;
    room.state = data.state;
    room.lastSyncAt = Date.now();
    room.lastActivity = Date.now();

    socket.to(code).emit("sync-heartbeat", { time: data.time, state: data.state });
  });

  // === STREAM CHANGES (host only) ===
  socket.on("set-stream", (data) => {
    const code = socketRooms.get(socket.id);
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;

    room.streamUrl = data.streamUrl;
    room.quality = data.quality;
    room.streams = data.streams;
    room.translators = data.translators;
    room.translatorId = data.translatorId;
    room.lastActivity = Date.now();

    socket.to(code).emit("stream-changed", data);
  });

  socket.on("change-quality", (data) => {
    const code = socketRooms.get(socket.id);
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;

    room.quality = data.quality;
    room.streamUrl = data.streamUrl;
    room.lastActivity = Date.now();
    const member = room.members.find((m) => m.id === socket.id);
    socket.to(code).emit("quality-changed", { ...data, by: member?.name || "Host" });
  });

  socket.on("change-translator", (data) => {
    const code = socketRooms.get(socket.id);
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;

    room.translatorId = data.translatorId;
    room.lastActivity = Date.now();
    const member = room.members.find((m) => m.id === socket.id);
    socket.to(code).emit("translator-changed", { ...data, by: member?.name || "Host" });
  });

  socket.on("change-episode", (data) => {
    const code = socketRooms.get(socket.id);
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;

    room.season = data.season;
    room.episode = data.episode;
    room.lastActivity = Date.now();
    const member = room.members.find((m) => m.id === socket.id);
    socket.to(code).emit("episode-changed", { ...data, by: member?.name || "Host" });
  });

  // === START PLAYBACK (host triggers from lobby) ===
  socket.on("start-playback", () => {
    const code = socketRooms.get(socket.id);
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;

    console.log(`[room] Starting playback in ${code}`);

    // Countdown 3-2-1
    let count = 3;
    const countInterval = setInterval(() => {
      io.to(code).emit("playback-starting", { countdown: count });
      count--;
      if (count < 0) {
        clearInterval(countInterval);
        room.state = "playing";
        room.currentTime = 0;
        room.lastSyncAt = Date.now();
        room.lastActivity = Date.now();
        // Reset ready states
        room.members.forEach((m) => (m.isReady = false));
        io.to(code).emit("playback-go");
      }
    }, 1000);
  });

  // === CHAT ===
  socket.on("chat-message", (data) => {
    const code = socketRooms.get(socket.id);
    const room = rooms.get(code);
    if (!room || !data.text?.trim()) return;

    const member = room.members.find((m) => m.id === socket.id);
    const msg = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      author: member?.name || "?",
      text: data.text.trim().slice(0, 500),
      timestamp: Date.now(),
      type: "message",
    };

    room.messages.push(msg);
    // Keep last 200 messages
    if (room.messages.length > 200) room.messages = room.messages.slice(-200);
    room.lastActivity = Date.now();

    io.to(code).emit("chat-message", msg);
  });

  socket.on("chat-reaction", (data) => {
    const code = socketRooms.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;

    const member = room.members.find((m) => m.id === socket.id);
    room.lastActivity = Date.now();
    io.to(code).emit("chat-reaction", { emoji: data.emoji, by: member?.name || "?" });
  });

  // === DISCONNECT ===
  socket.on("disconnect", () => {
    console.log(`[disconnect] ${socket.id}`);
    handleLeave(socket);
  });
});

function handleLeave(socket) {
  const code = socketRooms.get(socket.id);
  if (!code) return;

  const room = rooms.get(code);
  socketRooms.delete(socket.id);
  socket.leave(code);

  if (!room) return;

  const member = room.members.find((m) => m.id === socket.id);
  const name = member?.name || "?";
  room.members = room.members.filter((m) => m.id !== socket.id);
  room.lastActivity = Date.now();

  // Notify others
  socket.to(code).emit("member-left", { memberId: socket.id, name });

  // System message
  const sysMsg = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    author: "system",
    text: `${name} вышел`,
    timestamp: Date.now(),
    type: "system",
  };
  room.messages.push(sysMsg);
  io.to(code).emit("chat-message", sysMsg);

  // If host left, promote someone or close room (with grace period)
  if (room.hostId === socket.id) {
    if (room.members.length > 0) {
      const newHost = room.members[0];
      newHost.isHost = true;
      room.hostId = newHost.id;

      const promoMsg = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        author: "system",
        text: `${newHost.name} теперь хост`,
        timestamp: Date.now(),
        type: "system",
      };
      room.messages.push(promoMsg);
      io.to(code).emit("chat-message", promoMsg);
      console.log(`[room] Host promoted: ${newHost.name} in ${code}`);
    } else {
      // Grace period: don't delete immediately — host may be navigating between pages
      room.hostId = null;
      console.log(`[room] Room ${code} empty, grace period 15s`);
      setTimeout(() => {
        const r = rooms.get(code);
        if (r && r.members.length === 0) {
          rooms.delete(code);
          console.log(`[room] Room ${code} closed (empty after grace)`);
        }
      }, 15000);
    }
  } else if (room.members.length === 0) {
    // Non-host was last member
    room.hostId = null;
    console.log(`[room] Room ${code} empty, grace period 15s`);
    setTimeout(() => {
      const r = rooms.get(code);
      if (r && r.members.length === 0) {
        rooms.delete(code);
        console.log(`[room] Room ${code} closed (empty after grace)`);
      }
    }, 15000);
  }

  console.log(`[room] ${name} left room ${code} (${room.members.length} remaining)`);
}

server.listen(PORT, () => {
  console.log(`[socket-server] Watch Together running on port ${PORT}`);
});
