"use client";

import Image from "next/image";
import { useState } from "react";

// Постер с авто-ретраем + ДЖИТТЕРОМ. TMDB-картинки идут через /tmdb-img/ → wsrv.nl;
// при ХОЛОДНОЙ загрузке пачки (20+ постеров) wsrv отдаёт 403 на часть коннектов
// (лимит одновременных с одного IP), а браузер сам НЕ перезапрашивает <img>.
// При ошибке ремонтируем картинку (до 5 раз), НО с рандомной задержкой — иначе все
// битые ретраятся синхронно и снова бёрстят wsrv. Джиттер размазывает повторы →
// они проходят и кэшируются в nginx (30д). Общий фикс постеров на всём сайте.
const MAX_RETRY = 5;

interface Props {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

export function PosterImage({ src, alt, className, sizes, priority }: Props) {
  const [retry, setRetry] = useState(0);
  // На ретрае добавляем cache-bust — обойти уже закэшированный браузером/CF 403
  // (до фикса nginx их вешали immutable). TMDB игнорит лишний query.
  const effSrc = retry === 0 ? src : src + (src.includes("?") ? "&" : "?") + "v=" + retry;
  return (
    <Image
      key={retry}
      src={effSrc}
      alt={alt}
      fill
      priority={priority}
      className={className}
      sizes={sizes}
      onError={() => {
        // key={retry} ремонтирует <img> → onError видит актуальный retry.
        if (retry >= MAX_RETRY) return;
        // Рандомный джиттер, растущий с попыткой: повторы не бьют wsrv синхронно.
        const delay = 500 + Math.random() * 1800 * (retry + 1);
        setTimeout(() => setRetry((x) => (x > retry ? x : retry + 1)), delay);
      }}
    />
  );
}
