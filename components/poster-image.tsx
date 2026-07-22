"use client";

import Image from "next/image";
import { useState } from "react";

// Постер с авто-ретраем. TMDB-картинки идут через прокси /tmdb-img/ → wsrv.nl;
// при загрузке пачки (20+ постеров разом) wsrv троттлит часть → чёрные плитки, а
// браузер сам НЕ перезапрашивает <img>. Здесь при ошибке ремонтируем картинку с
// задержкой (до 3 раз) — повторный запрос почти всегда проходит (бёрст прошёл /
// картинка уже в кэше nginx). Общий фикс для всех карточек сайта.
interface Props {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

export function PosterImage({ src, alt, className, sizes, priority }: Props) {
  const [retry, setRetry] = useState(0);
  return (
    <Image
      key={retry}
      src={src}
      alt={alt}
      fill
      priority={priority}
      className={className}
      sizes={sizes}
      onError={() => {
        if (retry < 3) {
          const delay = 500 + retry * 500;
          setTimeout(() => setRetry((r) => r + 1), delay);
        }
      }}
    />
  );
}
