import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type React from "react";
import "./globals.css";
import { AuthProvider } from "@/components/auth-context";
import { MobileNav } from "@/components/mobile-nav";

import { ThemeProvider } from "@/components/theme-provider";

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
title: "Кинотеатр Егора - Смотреть фильмы онлайн",
description: "Кинотеатр Егора: Смотрите фильмы онлайн бесплатно в HD качестве с русской озвучкой.",
generator: "v0.app",
openGraph: {
title: "Кинотеатр Егора - Смотреть фильмы онлайн",
description: "Смотрите любимые фильмы бесплатно без регистрации",
type: "website",
images: ["/logo.png"],
},
twitter: {
card: "summary_large_image",
title: "Кинотеатр Егора - Смотреть фильмы онлайн",
description: "Смотрите любимые фильмы бесплатно без регистрации",
images: ["/logo.png"],
},
icons: {
icon: "/logo.png",
shortcut: "/logo.png",
apple: "/logo.png",
},
};

export const viewport = {
colorScheme: "dark",
themeColor: "#0f1419",
userScalable: true,
width: "device-width",
initialScale: 1,
};

export default function RootLayout({
children,
}: Readonly<{
children: React.ReactNode;
}>) {
return (
<html lang="ru" suppressHydrationWarning>
<head>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script dangerouslySetInnerHTML={{__html: `
  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.expand();
    window.Telegram.WebApp.disableVerticalSwipes();
  }
`}} />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

            <script dangerouslySetInnerHTML={{__html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
              }
            `}} />
          </head>
<body className="font-sans antialiased bg-background text-foreground">
<ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
<AuthProvider>
{children}
</AuthProvider>
</ThemeProvider>
<Analytics />
        <MobileNav />
      </body>
</html>
);
}


