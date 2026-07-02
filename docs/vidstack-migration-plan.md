# Vidstack Migration Plan — KinoTV Web

> Подготовлено агентом-исследователем на основе официальной документации Vidstack.
> Использовать для миграции `components/movie-player.tsx` и `components/tv-player.tsx`.

## 1. Установка

```bash
bun add @vidstack/react hls.js
bun remove plyr plyr-react
```

## 2. CSS импорты (один раз в `app/layout.tsx` или `app/globals.css`)

```ts
// Default Layout (быстрая миграция):
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

// Полностью кастомные controls (Tailwind):
import "@vidstack/react/player/styles/base.css";
```

## 3. Hooks — что использовать когда

| Hook | Use case |
|---|---|
| `useMediaPlayer()` | Получить MediaPlayerInstance из child компонента |
| `useMediaState('currentTime', ref?)` | Реактивная подписка на одно поле — re-renders на каждое изменение |
| `useMediaStore(ref)` | Snapshot всего состояния (использовать осторожно — больше re-renders) |
| `ref.current` (imperative API) | `play()`, `pause()`, `currentTime = X`, `enterFullscreen()` — для socket callbacks и setInterval |

**Критическое правило:** для `setInterval` save и socket-driven Send-to-TV / Watch Together — НИКОГДА не используй hooks, используй `ref.current.currentTime`.

## 4. Events (React props на `<MediaPlayer>`)

| Need | Vidstack prop | Detail |
|---|---|---|
| `play` | `onPlay` | empty |
| `pause` | `onPause` | empty |
| `seeking` | `onSeeking` | `event.detail` is target time |
| `seeked` | `onSeeked` | `event.detail` is new time |
| `ended` | `onEnded` | empty |
| `timeupdate` | `onTimeUpdate` | `event.detail = { currentTime, played }` |
| `canplay` | `onCanPlay` | once stream is ready |

## 5. Готовый компонент `<KinoPlayer>`

Создать `components/kino-player.tsx`:

```tsx
"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import {
  MediaPlayer,
  MediaProvider,
  type MediaPlayerInstance,
  type MediaCanPlayEvent,
  type MediaTimeUpdateEvent,
  type MediaTimeUpdateEventDetail,
} from "@vidstack/react";
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from "@vidstack/react/player/layouts/default";

export interface KinoPlayerHandle {
  play: () => Promise<void>;
  pause: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setCurrentTime: (t: number) => void;
  isPaused: () => boolean;
  enterFullscreen: () => Promise<void>;
}

export interface KinoPlayerProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  startTime?: number;
  title?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onSeeked?: (time: number) => void;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onCanPlay?: () => void;
  className?: string;
}

export const KinoPlayer = forwardRef<KinoPlayerHandle, KinoPlayerProps>(
  function KinoPlayer(
    { src, poster, autoPlay = true, startTime, title,
      onPlay, onPause, onSeeked, onEnded, onTimeUpdate, onCanPlay, className },
    forwardedRef
  ) {
    const playerRef = useRef<MediaPlayerInstance>(null);
    const startTimeRef = useRef(startTime);
    startTimeRef.current = startTime;

    useImperativeHandle(forwardedRef, () => ({
      play: async () => { await playerRef.current?.play(); },
      pause: () => { playerRef.current?.pause(); },
      getCurrentTime: () => playerRef.current?.currentTime ?? 0,
      getDuration: () => playerRef.current?.duration ?? 0,
      setCurrentTime: (t) => { if (playerRef.current) playerRef.current.currentTime = t; },
      isPaused: () => playerRef.current?.paused ?? true,
      enterFullscreen: async () => { await playerRef.current?.enterFullscreen(); },
    }));

    const handleCanPlay = (_e: MediaCanPlayEvent) => {
      if (startTimeRef.current && startTimeRef.current > 1 && playerRef.current) {
        playerRef.current.currentTime = startTimeRef.current;
        startTimeRef.current = undefined;
      }
      onCanPlay?.();
    };

    const handleTimeUpdate = (e: MediaTimeUpdateEvent) => {
      const detail = e.detail as MediaTimeUpdateEventDetail;
      const dur = playerRef.current?.duration ?? 0;
      onTimeUpdate?.(detail.currentTime, dur);
    };

    return (
      <MediaPlayer
        ref={playerRef}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        playsInline
        title={title}
        crossOrigin
        load="eager"
        className={className}
        onPlay={onPlay}
        onPause={onPause}
        onSeeked={(e) => onSeeked?.(e.detail)}
        onEnded={onEnded}
        onTimeUpdate={handleTimeUpdate}
        onCanPlay={handleCanPlay}
      >
        <MediaProvider />
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>
    );
  }
);
```

## 6. Интеграция с существующим кодом

### Resume + 5s save:
```tsx
useEffect(() => {
  const id = setInterval(() => {
    const player = playerRef.current;
    if (!player || player.isPaused()) return;
    const ct = player.getCurrentTime();
    const dur = player.getDuration();
    if (ct > 0 && dur > 0) {
      savePosition(movie.id, "movie", ct, dur);
      addToHistory({ /* … */ progress: ct, duration: dur });
    }
  }, 5000);
  return () => clearInterval(id);
}, [movie.id]);

<KinoPlayer ref={playerRef} src={...} startTime={resumeTime} ... />
```

### Send-to-TV: НИЧЕГО МЕНЯТЬ НЕ НАДО (только открывает socket с streamData).

### Watch Together — emit + apply через ref:
```tsx
const ignoreRemoteRef = useRef(false);
const onPlay = () => {
  if (ignoreRemoteRef.current) return;
  socket.emit("wt:play", { time: playerRef.current?.getCurrentTime() });
};
// ... аналогично для pause, seek

socket.on("wt:play", ({ time }) => apply(() => {
  playerRef.current?.setCurrentTime(time);
  playerRef.current?.play();
}));
```

200ms ignore window для избежания echo loop.

### Quality switcher (наши 360/480/720/1080):
```tsx
const [pendingSeek, setPendingSeek] = useState<number | null>(null);

const changeQuality = (q: string) => {
  const ct = playerRef.current?.getCurrentTime() ?? 0;
  setPendingSeek(ct);
  setSelectedQuality(q);
};

<KinoPlayer
  src={streamData.streams[selectedQuality]}
  startTime={pendingSeek ?? resumeTime ?? undefined}
  onCanPlay={() => setPendingSeek(null)}
/>
```

Translator switcher — точно так же.

## 7. Стратегия миграции (порядок)

1. Установить deps + CSS imports — 5 мин
2. Создать `KinoPlayer` + тест-страница `/test-player` с публичным HLS — проверить что HLS играет, controls работают
3. Мигрировать `movie-player.tsx` (проще — без эпизодов)
4. QA: resume, quality, translator, fullscreen на desktop+mobile+Telegram, Send-to-TV, Watch Together (2 вкладки)
5. Мигрировать `tv-player.tsx`
6. Удалить `plyr` + `plyr-react`
7. Удалить мёртвый `hls.js` direct imports

## 8. Чек-лист тестов на каждый плеер

- [ ] First play стартует с 0 (или resume)
- [ ] Position сохраняется каждые 5с
- [ ] Quality switch сохраняет current time ±1с
- [ ] Translator switch сохраняет current time ±1с
- [ ] Episode "Next" грузит новую серию с time=0
- [ ] Fullscreen работает на desktop, iOS Safari, Android Chrome, Telegram WebApp
- [ ] Send-to-TV открывает modal без console errors
- [ ] Watch Together: play в tab A → tab B играет в течение 500ms; seek в A → B seek; нет infinite loop
- [ ] HLS (`.m3u8`) играет
- [ ] MP4 играет
- [ ] beforeunload save срабатывает

## 9. Риски

- **SSR**: Vidstack клиент-only, но не падает при импорте. `"use client"` в компонентах — обязательно.
- **Bundle size**: +35 KB к Plyr (Vidstack core ~50-60 KB + DefaultVideoLayout ~25 KB). Без DefaultLayout (custom controls) — экономия 25 KB.
- **Tailwind 4**: zero conflict (Vidstack использует scoped `[data-media-player]` selectors). Опционально установить `@vidstack/react/tailwind.cjs` plugin для variants `media-paused:`, `media-playing:`, `media-fullscreen:`.
- **React 19 + Next 16**: Vidstack ^1.12.0 поддерживает.
- **Telegram WebApp fullscreen**: оставить существующую логику с `isTelegram` branch — Vidstack `enterFullscreen()` использует стандартный Fullscreen API.
- **Source-change race**: при смене src + seek сразу — seek таргетит старый media. Всегда seek внутри `onCanPlay` (KinoPlayer выше делает это через startTimeRef).
- **Известные мелкие баги**: iOS Safari иногда игнорирует autoplay (та же ситуация что с Plyr); HLS.js может писать "manifest already loaded" при быстром src swap (косметика); Default Layout's quality menu НЕ покажет наши HDRezka качества (они отдельные URLs, не adaptive HLS variants) — поэтому держим custom quality buttons снаружи плеера.

## 10. Файлы которые нужно затронуть

- `components/movie-player.tsx` — заменить `<video>` блок (~lines 316-326), удалить `loadStream` (~156-176), удалить hlsRef plumbing
- `components/tv-player.tsx` — то же (~lines 356-366 и 194-214)
- `components/send-to-tv.tsx` — НЕ ТРОГАТЬ
- `package.json` — добавить `@vidstack/react`, удалить `plyr`/`plyr-react`, оставить `hls.js`
- `app/layout.tsx` — добавить два Vidstack CSS импорта
- НОВЫЙ файл: `components/kino-player.tsx`

**Оценка времени миграции: 2-3 часа на оба плеера + QA pass.**
