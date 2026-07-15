import { Navbar } from "@/components/navbar";
import { DownloadButton } from "@/components/download-button";
import { DownloadQR } from "@/components/download-qr";
import type { Metadata } from "next";
import { Tv } from "lucide-react";

export const metadata: Metadata = {
  title: "Приложение для Android TV — sapkeflykino",
  description: "Установите sapkeflykino на телевизор Android TV.",
};

// Телефонное приложение выведено из эксплуатации (все через сайт). Осталась
// только ТВ-версия (webview-обёртка для Android TV).
const TV_APK_URL = "/download/sapkeflykino-tv.apk";
const TV_APK_FULL = "https://sapkeflykino.ru/download/sapkeflykino-tv.apk";

export default function DownloadPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-12 pb-24 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/12 ring-1 ring-primary/30 text-primary mb-5">
            <Tv size={30} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-foreground">Приложение для Android TV</h1>
          <p className="mt-3 text-foreground/60 text-[15px] max-w-lg mx-auto leading-relaxed">
            Смотрите sapkeflykino на телевизоре. На телефоне и компьютере просто откройте
            сайт — отдельное приложение не нужно.
          </p>

          <div className="mt-8 flex flex-col items-center gap-5">
            <DownloadButton
              href={TV_APK_URL}
              sizeMb={2.7}
              version="TV"
              label="Скачать APK для ТВ"
              downloadName="sapkeflykino-tv.apk"
              icon="tv"
            />
            <div className="rounded-2xl p-5 bg-foreground/[0.03] ring-1 ring-white/[0.06]">
              <p className="text-foreground/70 text-[13px] mb-3">Или отсканируйте QR на телевизоре:</p>
              <DownloadQR url={TV_APK_FULL} />
            </div>
          </div>

          <div className="mt-10 text-left rounded-2xl p-5 bg-foreground/[0.03] ring-1 ring-white/[0.06]">
            <h2 className="text-foreground font-bold text-[15px] mb-2">Как установить на Android TV</h2>
            <ol className="text-foreground/60 text-[13.5px] space-y-1.5 list-decimal list-inside">
              <li>На ТВ разрешите установку из неизвестных источников (Настройки → Безопасность).</li>
              <li>Скачайте APK через браузер ТВ или приложение-загрузчик (например, Downloader) по ссылке выше.</li>
              <li>Откройте скачанный файл и установите.</li>
            </ol>
          </div>
        </div>
      </main>
    </>
  );
}
