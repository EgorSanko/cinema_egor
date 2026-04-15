// Shared types for Watch Together feature

export interface WatchMember {
  id: string;
  name: string;
  avatar?: string;
  isReady: boolean;
  isHost: boolean;
}

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  timestamp: number;
  type: "message" | "system" | "reaction";
}

export interface WatchRoomState {
  code: string;
  hostId: string;
  movieId: number;
  movieTitle: string;
  moviePoster: string | null;
  movieType: "movie" | "tv";
  movieYear: string;

  // Player state (host-authoritative)
  state: "lobby" | "loading" | "playing" | "paused";
  currentTime: number;
  lastSyncAt: number;

  // Stream info
  streamUrl: string;
  quality: string;
  streams: Record<string, string>;
  translatorId: number | null;
  translators: { id: number; name: string }[];

  // Series
  isSeries: boolean;
  season: number;
  episode: number;

  // Members
  members: WatchMember[];

  // Chat
  messages: ChatMessage[];

  createdAt: number;
}

// Socket.IO Events - Client to Server
export interface ClientToServerEvents {
  "create-room": (data: {
    name: string;
    movieId: number;
    movieTitle: string;
    moviePoster: string | null;
    movieType: "movie" | "tv";
    movieYear: string;
    isSeries: boolean;
  }, callback: (response: { code?: string; error?: string }) => void) => void;

  "join-room": (data: {
    code: string;
    name: string;
  }, callback: (response: { room?: WatchRoomState; error?: string }) => void) => void;

  "leave-room": () => void;

  // Player controls
  "player-play": (data: { time: number }) => void;
  "player-pause": (data: { time: number }) => void;
  "player-seek": (data: { time: number }) => void;
  "player-ready": () => void;
  "player-buffering": (data: { buffering: boolean }) => void;

  // Host sync heartbeat
  "sync-heartbeat": (data: { time: number; state: "playing" | "paused" }) => void;

  // Stream changes (host only)
  "change-quality": (data: { quality: string; streamUrl: string }) => void;
  "change-translator": (data: { translatorId: number; translatorName: string }) => void;
  "change-episode": (data: { season: number; episode: number }) => void;
  "set-stream": (data: {
    streamUrl: string;
    quality: string;
    streams: Record<string, string>;
    translators: { id: number; name: string }[];
    translatorId: number | null;
  }) => void;

  // Start playback (host only, from lobby)
  "start-playback": () => void;

  // Chat
  "chat-message": (data: { text: string }) => void;
  "chat-reaction": (data: { emoji: string }) => void;
}

// Socket.IO Events - Server to Client
export interface ServerToClientEvents {
  "room-created": (data: { code: string }) => void;
  "room-joined": (data: { room: WatchRoomState }) => void;
  "room-closed": () => void;
  "room-error": (data: { message: string }) => void;

  // Member events
  "member-joined": (data: { member: WatchMember }) => void;
  "member-left": (data: { memberId: string; name: string }) => void;
  "member-ready": (data: { memberId: string }) => void;
  "member-buffering": (data: { memberId: string; buffering: boolean }) => void;

  // Player sync
  "player-play": (data: { time: number; by: string }) => void;
  "player-pause": (data: { time: number; by: string }) => void;
  "player-seek": (data: { time: number; by: string }) => void;
  "sync-heartbeat": (data: { time: number; state: "playing" | "paused" }) => void;

  // Playback start (after lobby)
  "playback-starting": (data: { countdown: number }) => void;
  "playback-go": () => void;
  "all-ready": () => void;

  // Stream changes
  "stream-changed": (data: {
    streamUrl: string;
    quality: string;
    streams: Record<string, string>;
    translators: { id: number; name: string }[];
    translatorId: number | null;
  }) => void;
  "quality-changed": (data: { quality: string; streamUrl: string; by: string }) => void;
  "translator-changed": (data: { translatorId: number; translatorName: string; by: string }) => void;
  "episode-changed": (data: { season: number; episode: number; by: string }) => void;

  // Chat
  "chat-message": (data: ChatMessage) => void;
  "chat-reaction": (data: { emoji: string; by: string }) => void;
}
