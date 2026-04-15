"use client";

import { io, Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./watch-types";

type WatchSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: WatchSocket | null = null;

export function getSocket(): WatchSocket {
  if (!socket) {
    // In production, connect via /socket.io/ (nginx proxies to :3001)
    // In dev, connect directly to :3001
    const url =
      typeof window !== "undefined" && window.location.hostname === "localhost"
        ? "http://localhost:3001"
        : "/";

    socket = io(url, {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    }) as WatchSocket;
  }
  return socket;
}

export function connectSocket(): WatchSocket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
