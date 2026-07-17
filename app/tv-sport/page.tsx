import { TvSport } from "@/components/tv/tv-sport";

// TV WebView «Спорт» — прямой эфир (Про). Standalone, D-pad. Каналы тянутся
// клиентски (fetchChannels бьёт по residential-IP браузера), поэтому страница
// просто монтирует клиентский компонент.
export const metadata = {
  title: "SAPKEFLY KINO — Спорт",
};

export const dynamic = "force-dynamic";

export default function TvSportPage() {
  return <TvSport />;
}
