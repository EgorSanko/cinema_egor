import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Righteous } from "next/font/google";
import Script from "next/script";
import type React from "react";
import "./globals.css";
import { AuthProvider } from "@/components/auth-context";
import { AuthGate } from "@/components/auth-gate";
import { MobileNav } from "@/components/mobile-nav";
import { PWABackButton } from "@/components/pwa-back-button";
import { ReloadOnStale } from "@/components/reload-on-stale";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const _geistMono = Geist_Mono({ subsets: ["latin"] });
const righteous = Righteous({ subsets: ["latin"], weight: "400", variable: "--font-brand" });

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
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
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
    <html lang="ru" className={`dark ${geist.variable} ${righteous.variable}`}>
      <body className="font-sans antialiased bg-background text-foreground">
        <AuthProvider>
          {children}
          <AuthGate />
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
