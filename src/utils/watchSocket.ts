// Global socket reference for Watch Together
// Shared between WatchTogetherScreen and PlayerScreen
import type { Socket } from 'socket.io-client';

let globalSocket: Socket | null = null;

export function setWatchSocket(socket: Socket | null) {
  globalSocket = socket;
}

export function getWatchSocket(): Socket | null {
  return globalSocket;
}
