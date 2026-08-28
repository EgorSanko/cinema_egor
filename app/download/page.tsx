import { Navbar } from "@/components/navbar";
import { DownloadButton } from "@/components/download-button";
import { DownloadQR } from "@/components/download-qr";
import type { Metadata } from "next";
import { Tv } from "lucide-react";

export const metadata: Metadata = {
  title: "Приложение для телевизора — sapkeflykino",
  description: "Установите sapkeflykino на Android TV, Samsung, LG или Hisense.",
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
          <h1 className="text-3xl sm:text-4xl font-black text-foreground">Приложение для телевизора</h1>
          <p className="mt-3 text-foreground/60 text-[15px] max-w-lg mx-auto leading-relaxed">
            Смотрите sapkeflykino на телевизоре. Для Android TV есть приложение,
            для Samsung, LG и Hisense — установка без него, ниже расписано как.
            На телефоне и компьютере просто откройте сайт.
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
            <h2 className="text-foreground font-bold text-[15px] mb-2">Android TV, приставки, Google TV</h2>
            <ol className="text-foreground/60 text-[13.5px] space-y-1.5 list-decimal list-inside">
              <li>На ТВ разрешите установку из неизвестных источников (Настройки → Безопасность).</li>
              <li>Скачайте APK через браузер ТВ или приложение-загрузчик (например, Downloader) по ссылке выше.</li>
              <li>Откройте скачанный файл и установите.</li>
            </ol>
          </div>

          {/* Samsung, LG, Hisense: своя система, APK туда не ставится. Заходим
              через Media Station X — бесплатное приложение, которое есть в
              магазине каждого из этих телевизоров. Порядок проверен на живых
              Samsung (Tizen) и LG (webOS). */}
          <div className="mt-5 text-left rounded-2xl p-5 bg-foreground/[0.03] ring-1 ring-white/[0.06]">
            <h2 className="text-foreground font-bold text-[15px] mb-1">Samsung, LG, Hisense и другие</h2>
            <p className="text-foreground/50 text-[12.5px] mb-3 leading-relaxed">
              У этих телевизоров своя система, и APK на них не ставится. Заходим через
              бесплатное приложение Media Station X — оно есть в магазине каждого из них.
            </p>
            <ol className="text-foreground/60 text-[13.5px] space-y-1.5 list-decimal list-inside">
              <li>Откройте магазин приложений телевизора и установите <b>Media Station X</b>.</li>
              <li>Запустите его и зайдите в <b>Settings</b> → <b>Start Parameter</b> → <b>Setup</b>.</li>
              <li>
                Введите адрес: <b className="text-primary">sapkeflykino.ru</b>
                <span className="text-foreground/40"> — только адрес, без «https» и без косой черты.</span>
              </li>
              <li>Сохраните и перезапустите Media Station X — кинотеатр откроется сам.</li>
            </ol>
            <p className="text-foreground/50 text-[12.5px] mt-3 leading-relaxed">
              Вход на телевизоре — по QR: наведите камеру телефона на код с экрана и подтвердите.
              История и «Продолжить просмотр» общие с сайтом и телефоном.
            </p>
          </div>

          <div className="mt-5 text-left rounded-2xl p-5 bg-foreground/[0.03] ring-1 ring-white/[0.06]">
            <h2 className="text-foreground font-bold text-[15px] mb-2">Если что-то пошло не так</h2>
            <ul className="text-foreground/60 text-[13.5px] space-y-1.5 list-disc list-inside">
              <li>
                <b>Открылось не то или старое меню.</b> Зайдите в Settings → Start Parameter → Setup
                и введите адрес заново: Media Station X запоминает прошлый экран.
              </li>
              <li>
                <b>Media Station X нет в магазине.</b> На части моделей она называется
                MSX. Если нет и её — напишите нам, подскажем по вашей модели.
              </li>
              <li>
                <b>Не проходит вход.</b> Код действует несколько минут. Нажмите OK на
                телевизоре, чтобы получить новый.
              </li>
            </ul>
          </div>
        </div>
      </main>
    </>
  );
}
