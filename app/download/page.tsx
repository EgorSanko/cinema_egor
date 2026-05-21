import { Navbar } from "@/components/navbar";
import { DownloadButton } from "@/components/download-button";
import { DownloadQR } from "@/components/download-qr";
import type { Metadata } from "next";
import Image from "next/image";
import { Smartphone, Download, ShieldCheck, Zap, Settings as SettingsIcon, Play, Heart, Tv as TvIcon, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Скачать приложение — sapkeflykino",
  description: "Sapkefly Kino для Android — фильмы и сериалы в одном приложении. Бесплатно, без рекламы, прямо на телефон.",
  openGraph: {
    title: "Sapkefly Kino — приложение для Android",
    description: "Бесплатно, без рекламы. Фильмы, сериалы, синхронизация с сайтом.",
    images: ["/logo-512.png"],
  },
};

const APK_URL = "/download/sapkefly.apk";
const APK_SIZE_MB = 88;
const APP_VERSION = "2.0.18";

const FEATURES: { Icon: any; title: string; sub: string }[] = [
  { Icon: TvIcon, title: "Фильмы и сериалы", sub: "Огромная база с переводом и оригиналом" },
  { Icon: Heart, title: "Избранное и история", sub: "Синхронизация с аккаунтом сайта" },
  { Icon: Play, title: "Продолжить просмотр", sub: "Тайм-код запоминается между устройствами" },
  { Icon: Sparkles, title: "Без рекламы", sub: "Чистый интерфейс, никаких баннеров" },
];

const STEPS: string[] = [
  "Нажмите «Скачать APK» — файл загрузится в папку «Загрузки» на телефоне.",
  "Откройте файл — Android попросит разрешить установку из этого источника. Тапните «Настройки» и включите «Разрешить установку».",
  "Вернитесь и нажмите «Установить». Через несколько секунд иконка появится на экране.",
  "Войдите тем же аккаунтом, что и на сайте — история и избранное подтянутся автоматически.",
];

export default function DownloadPage() {
  return (
    <>
      <Navbar />
      <main className="bg-background min-h-screen pb-20 sm:pb-12">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14">

          {/* === HERO === */}
          <section className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 sm:gap-10 items-center">
            <div className="relative w-32 h-32 sm:w-44 sm:h-44 mx-auto md:mx-0">
              <div className="absolute inset-0 rounded-[28%] bg-primary/30 blur-2xl" />
              <div className="relative w-full h-full rounded-[28%] overflow-hidden ring-1 ring-white/10 shadow-2xl shadow-primary/20">
                <Image src="/kinotv-icon.png" alt="Sapkefly Kino" fill className="object-cover" sizes="180px" priority />
              </div>
            </div>

            <div className="text-center md:text-left">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 ring-1 ring-primary/30 text-primary text-[11px] font-bold uppercase tracking-[0.18em]">
                <Smartphone size={12} /> Android
              </span>
              <h1 className="mt-3 text-4xl sm:text-5xl md:text-6xl font-black text-foreground tracking-tight leading-[1.02]">
                Sapkefly Kino<br />
                <span className="text-primary">прямо на телефоне</span>
              </h1>
              <p className="mt-3 text-foreground/65 text-[14px] sm:text-[15px] max-w-xl mx-auto md:mx-0">
                Фильмы и сериалы в одном приложении. Без рекламы, с синхронизацией истории и избранного с сайтом.
              </p>

              <div className="mt-6 flex flex-col sm:flex-row items-center md:items-start gap-3">
                <DownloadButton href={APK_URL} sizeMb={APK_SIZE_MB} version={APP_VERSION} />
                <div className="text-[11px] text-foreground/45 text-center md:text-left">
                  Версия {APP_VERSION} · {APK_SIZE_MB} МБ · Android 7.0+
                </div>
              </div>
            </div>
          </section>

          {/* === FEATURES === */}
          <section className="mt-14 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURES.map(({ Icon, title, sub }) => (
              <div key={title} className="flex items-start gap-3 p-4 rounded-2xl bg-foreground/[0.03] ring-1 ring-white/[0.06]">
                <div className="h-10 w-10 rounded-xl bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center text-primary flex-shrink-0">
                  <Icon size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-foreground font-semibold text-[14px]">{title}</h3>
                  <p className="text-foreground/55 text-[12px] mt-0.5">{sub}</p>
                </div>
              </div>
            ))}
          </section>

          {/* === QR for desktop users === */}
          <section className="mt-10 p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-primary/[0.07] to-primary/[0.02] ring-1 ring-primary/20">
            <div className="flex flex-col sm:flex-row items-center gap-5">
              <DownloadQR url="https://sapkeflykino.ru/download" />
              <div className="text-center sm:text-left flex-1">
                <h3 className="text-foreground font-bold text-[15px] flex items-center gap-2 justify-center sm:justify-start">
                  <Smartphone size={16} className="text-primary" /> Скачать на телефон
                </h3>
                <p className="text-foreground/65 text-[13px] mt-1 max-w-md">
                  Если вы открыли страницу с компьютера — отсканируйте QR-код камерой телефона, чтобы перейти к загрузке.
                </p>
              </div>
            </div>
          </section>

          {/* === INSTALL STEPS === */}
          <section className="mt-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              Как установить
            </h2>
            <p className="text-foreground/55 text-[13px] mt-1">
              Приложения нет в Google Play — устанавливаем напрямую, это безопасно и занимает минуту.
            </p>
            <ol className="mt-6 space-y-3">
              {STEPS.map((step, i) => (
                <li key={i} className="flex items-start gap-3 p-4 rounded-xl bg-foreground/[0.03] ring-1 ring-white/[0.06]">
                  <span className="h-7 w-7 flex-shrink-0 rounded-full bg-primary/15 ring-1 ring-primary/30 text-primary font-bold text-[13px] flex items-center justify-center">
                    {i + 1}
                  </span>
                  <p className="text-foreground/85 text-[14px] leading-relaxed pt-0.5">{step}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* === TRUST ROW === */}
          <section className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-foreground/[0.03] ring-1 ring-white/[0.06]">
              <ShieldCheck size={20} className="text-primary flex-shrink-0" />
              <p className="text-foreground/75 text-[13px]">Без сбора данных и рекламных трекеров</p>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-xl bg-foreground/[0.03] ring-1 ring-white/[0.06]">
              <Zap size={20} className="text-primary flex-shrink-0" />
              <p className="text-foreground/75 text-[13px]">Лёгкий APK · 88 МБ · быстрая установка</p>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-xl bg-foreground/[0.03] ring-1 ring-white/[0.06]">
              <SettingsIcon size={20} className="text-primary flex-shrink-0" />
              <p className="text-foreground/75 text-[13px]">Обновления — прямо в приложении</p>
            </div>
          </section>

          {/* === IOS NOTICE === */}
          <section className="mt-10 p-5 rounded-2xl bg-foreground/[0.03] ring-1 ring-white/[0.06] text-center">
            <p className="text-foreground/65 text-[13px]">
              <span className="text-foreground/85 font-semibold">iPhone и iPad</span> — приложение в разработке. Пока используйте сайт <span className="text-primary">sapkeflykino.ru</span> прямо в Safari, всё работает один в один.
            </p>
          </section>

        </div>
      </main>
    </>
  );
}
