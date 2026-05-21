import { NextResponse } from "next/server";

/**
 * App version manifest — fetched by the mobile app on launch to decide whether
 * to nag users for an update or block usage on outdated builds.
 *
 * - `latest`: current version on the store / sapkeflykino.ru/download
 * - `minimum`: oldest version still allowed to run. Below this the app must
 *   show a blocking "update required" screen and refuse to play.
 * - `downloadUrl`: direct APK link, opened in the system browser
 * - `releaseNotes`: short changelog shown in the soft-update banner
 */

const MANIFEST = {
  latest: "2.0.17",
  // Lowered from 2.0.8 → 2.0.5 so all 2.0.5/2.0.6/2.0.7 users see a soft
  // "update available" banner instead of a blocking screen. Hard-block
  // only kicks in for builds older than that (none in the wild today).
  minimum: "2.0.5",
  downloadUrl: "https://sapkeflykino.ru/download/sapkefly.apk",
  downloadPage: "https://sapkeflykino.ru/download",
  releaseNotes: [
    "Новый кинематографичный профиль с достижениями по редкости",
    "Иконки достижений — векторные, единый стиль на всех устройствах",
    "Исправлено: озвучка отображалась неверно при «Продолжить просмотр»",
    "Тепловая карта просмотров (12 недель), статистика и мои списки",
  ],
};

export async function GET() {
  return NextResponse.json(MANIFEST, {
    headers: {
      "Cache-Control": "public, max-age=60",
    },
  });
}
