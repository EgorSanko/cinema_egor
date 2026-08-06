"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// Ненавязчивый дисклеймер снизу — НЕ блокирует сайт. Раньше был полноэкранный
// оверлей с обязательным «Принимаю»: пока не нажмёшь — внутрь не попасть. Из-за
// него проверяющие/трафик «упирались» и не могли провалиться к контенту. Теперь
// сайт открывается сразу, а плашка просто висит снизу и закрывается по «Понятно».
// Полные условия — на /rules.
export function TermsModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try { if (!localStorage.getItem("terms_accepted")) setShow(true); } catch {}
  }, []);

  const accept = () => {
    try { localStorage.setItem("terms_accepted", "true"); } catch {}
    setShow(false);
  };

  if (!show) return null;

  return (
    // pointer-events-none на обёртке + auto на плашке → остальной сайт полностью
    // кликабелен, ловит клики только сама плашка. Никакого блокирующего фона.
    <div className="fixed bottom-0 inset-x-0 z-40 p-3 sm:p-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl bg-card/95 backdrop-blur ring-1 ring-border shadow-2xl px-4 py-3 flex flex-col sm:flex-row items-center gap-3">
        <p className="text-[13px] text-foreground/80 leading-snug text-center sm:text-left flex-1">
          Продолжая пользоваться сайтом, вы соглашаетесь с{" "}
          <Link href="/rules" className="text-primary hover:underline">условиями использования</Link>.
          Контент не хранится на наших серверах, метаданные — TMDB.
        </p>
        <button
          onClick={accept}
          className="shrink-0 h-9 px-5 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-[13px] font-semibold transition-colors"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}
