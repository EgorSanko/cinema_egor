import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Righteous, Oswald } from "next/font/google";
import Script from "next/script";
import type React from "react";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { AuthProvider } from "@/components/auth-context";
import { AuthGate } from "@/components/auth-gate";
import { MobileNav } from "@/components/mobile-nav";
import { PWABackButton } from "@/components/pwa-back-button";
import { ReloadOnStale } from "@/components/reload-on-stale";
import { SubscriptionEnforcer } from "@/components/subscription-enforcer";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const _geistMono = Geist_Mono({ subsets: ["latin"] });
const righteous = Righteous({ subsets: ["latin"], weight: "400", variable: "--font-brand" });
// Заголовочный шрифт. Один Geist на весь сайт делал типографику безликой
// (детектор Impeccable: single-font + overused-font — Geist в их списке
// «заезженных» вместе с Inter/Roboto). Oswald — узкий гротеск в духе киноафиши:
// длинные русские названия влезают в одну-две строки вместо трёх. Кириллица
// подключена явно, иначе заголовки уехали бы в системный фолбэк.
const oswald = Oswald({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

// Yandex.Metrika counter id. Set this to the number from metrika.yandex.ru
// (Настройки счётчика → «Номер счётчика»). 0 = disabled until provided.
const YM_ID = 110041488;

export const metadata: Metadata = {
  metadataBase: new URL("https://sapkeflykino.ru"),
  title: "sapkeflykino — смотреть фильмы онлайн",
  description: "sapkeflykino: Смотрите фильмы онлайн бесплатно в HD качестве с русской озвучкой.",
  generator: "v0.app",
  openGraph: {
    title: "sapkeflykino — смотреть фильмы онлайн",
    description: "Смотрите любимые фильмы бесплатно без регистрации",
    type: "website",
    images: ["/logo-512.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "sapkeflykino — смотреть фильмы онлайн",
    description: "Смотрите любимые фильмы бесплатно без регистрации",
    images: ["/logo-512.png"],
  },
  // Иконки для «добавить на главный экран». Раньше сюда был подставлен
  // /logo.png — это ШИРОКАЯ надпись (320x83), а не квадрат: iOS берёт для
  // ярлыка именно apple-иконку и обрезал её в квадрат, поэтому на телефоне
  // вместо логотипа выходила невнятная полоска. Теперь отдельные квадратные
  // иконки со знаком-камерой на фирменном тёмном фоне.
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "64x64", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.png",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0a0a0b",
  // App-like: lock zoom so the layout can't drift/“unfix” on a stray pinch or
  // double-tap while swiping season/episode strips on phones.
  userScalable: false,
  maximumScale: 1,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`dark ${geist.variable} ${righteous.variable} ${oswald.variable}`}>
      <body className="font-sans antialiased bg-background text-foreground">
        {/* Ловушка ошибок для устройств, где мы не можем открыть консоль (ТВ,
            приставки). Симптом, ради которого добавлено: на Android TV страница
            входа грузилась, заставка проигрывала — и всё замирало, потому что
            скрипты падали, а мы этого не видели. Скрипт нарочно написан на
            СТАРОМ синтаксисе и без зависимостей: он обязан выполниться даже
            там, где основной бандл не осилился, и шлёт ошибку картинкой (это
            переживает любые ограничения на запросы). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){function s(m,x){try{var i=new Image();i.src='/tv-error?m='+encodeURIComponent(String(m).slice(0,300))+'&x='+encodeURIComponent(String(x||'').slice(0,120));}catch(e){}}" +
              "window.onerror=function(m,src,l,c){s(m,(src||'')+':'+l+':'+c);};" +
              "window.addEventListener('unhandledrejection',function(e){s('promise: '+((e&&e.reason&&e.reason.message)||e.reason),'');});})();",
          }}
        />
        {/* Миграция застрявших на zenithjs («джетикс») → Alloha. Джетикс больше не
            основной источник (только тихий фолбэк). Двигаем ТОЛЬКО zenithjs/пустое,
            явный выбор Про (hdrezka/kino.pub) не трогаем. До гидрации, чтобы навбар/
            плеер сразу читали alloha. Новый флаг v2 — чтобы прогнать всех разово. */}
        <Script id="force-free-source" strategy="beforeInteractive">{`
          try {
            if (!localStorage.getItem('kino_src_force_v2')) {
              var s = localStorage.getItem('kino_source');
              if (!s || s === 'zenithjs') localStorage.setItem('kino_source','alloha');
              localStorage.setItem('kino_src_force_v2','1');
            }
          } catch (e) {}
        `}</Script>
        <AuthProvider>
          {children}
          <SiteFooter />
          <AuthGate />
          <SubscriptionEnforcer />
        </AuthProvider>
        <MobileNav />
        <PWABackButton />
        <ReloadOnStale />
        {YM_ID > 0 && (
          <Script id="yandex-metrika" strategy="afterInteractive">{`
            (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
            k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
            (window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
            ym(${YM_ID}, "init", { clickmap:true, trackLinks:true, accurateTrackBounce:true, webvisor:true });
          `}</Script>
        )}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
        <Script id="tg-init" strategy="afterInteractive">{`
          try {
            if (window.Telegram && window.Telegram.WebApp) {
              window.Telegram.WebApp.expand && window.Telegram.WebApp.expand();
              window.Telegram.WebApp.disableVerticalSwipes && window.Telegram.WebApp.disableVerticalSwipes();
            }
          } catch (e) {}
        `}</Script>
        <Script id="sw-reg" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').then(function(reg){
              if (!reg) return;
              // Force update check immediately AND on every tab-focus.
              // Mobile PWA tabs stay alive for days — without these the
              // service worker only checks for updates on hard reload,
              // so a deployed fix never reaches iPhone home-screen apps
              // until the user manually closes the standalone window.
              try { reg.update(); } catch (e) {}
              document.addEventListener('visibilitychange', function(){
                if (document.visibilityState === 'visible') {
                  try { reg.update(); } catch (e) {}
                }
              });
              // Re-check every 30 minutes in case the tab stays foreground
              setInterval(function(){
                try { reg.update(); } catch (e) {}
              }, 30 * 60 * 1000);
            }).catch(function(){});
          }
        `}</Script>
      </body>
    </html>
  );
}
