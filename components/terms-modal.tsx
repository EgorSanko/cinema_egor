"use client";

import { useState, useEffect } from "react";

export function TermsModal() {
const [show, setShow] = useState(false);

useEffect(() => {
const accepted = localStorage.getItem("terms_accepted");
if (!accepted) setShow(true);
}, []);

const accept = () => {
localStorage.setItem("terms_accepted", "true");
setShow(false);
};

if (!show) return null;

return (
<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
<div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
<h2 className="text-xl font-bold text-foreground">Условия использования</h2>
<div className="text-sm text-muted-foreground space-y-3 max-h-[300px] overflow-y-auto">
<p>
Кинотеатр Егора не хранит контент на своих серверах. Все данные о фильмах,
постеры и метаданные предоставлены The Movie Database (TMDB).
</p>
<p>
Видеоконтент встроен из внешних источников. Мы не несём ответственности
за контент, размещённый на сторонних сайтах.
</p>
<p>
Кинотеатр Егора уважает интеллектуальную собственность. Мы предоставляем
ссылки на внешние источники и не контролируем их содержание.
</p>
<p>
Используя Кинотеатр Егора, вы соглашаетесь соблюдать все применимые законы
и правила вашей юрисдикции.
</p>
</div>
<button onClick={accept}
className="w-full py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors">
Принимаю
</button>
</div>
</div>
);
}
