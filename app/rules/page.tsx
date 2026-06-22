import Link from "next/link";

export const metadata = {
  title: "Правила и условия — SAPKEFLY KINO",
  description: "Правила использования онлайн-кинотеатра SAPKEFLY KINO.",
};

export default function RulesPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-5 py-12">
        <Link href="/" className="text-primary text-sm hover:underline">← На главную</Link>

        <h1 className="text-3xl font-bold mt-5 mb-6">Правила и условия использования</h1>

        <div className="space-y-4 text-[15px] leading-relaxed text-foreground/75">
          <p>
            SAPKEFLY KINO — бесплатный онлайн-кинотеатр. Сервис не хранит видеоконтент
            на своих серверах. Информация о фильмах и сериалах, постеры и метаданные
            предоставлены The Movie Database (TMDB).
          </p>
          <p>
            Видео встраивается из внешних источников. Администрация не размещает
            контент и не несёт ответственности за материалы, расположенные на
            сторонних ресурсах.
          </p>
          <p>
            Сервис уважает интеллектуальную собственность. Если вы правообладатель
            и считаете, что какой-либо материал нарушает ваши права, напишите нам — мы
            оперативно закроем доступ к соответствующей странице.
          </p>
          <p>
            Сервис предназначен для личного некоммерческого просмотра. Используя
            SAPKEFLY KINO, вы соглашаетесь соблюдать все применимые законы и правила
            вашей юрисдикции и подтверждаете, что вам исполнилось 18 лет.
          </p>
          <p>
            Регистрация по email используется только для сохранения вашей истории
            просмотра, избранного и прогресса. Мы не передаём ваши данные третьим
            лицам.
          </p>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 text-sm text-foreground/50 space-y-1">
          <p>🌐 Сайт: <a href="https://sapkeflykino.ru" className="text-primary hover:underline">sapkeflykino.ru</a></p>
          <p>📢 Новинки: <a href="https://t.me/sapkeflykino" className="text-primary hover:underline">@sapkeflykino</a></p>
          <p>🔍 Поиск в Telegram: <a href="https://t.me/sapkeflykino_bot" className="text-primary hover:underline">@sapkeflykino_bot</a></p>
        </div>
      </div>
    </main>
  );
}
