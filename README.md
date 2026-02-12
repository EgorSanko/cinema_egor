# 🎬 Кинотеатр Егора

Персональный стриминговый сервис с поддержкой Smart TV, мобильных устройств и десктопа.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Python](https://img.shields.io/badge/Python-3.12-green?logo=python)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)
![License](https://img.shields.io/badge/license-private-red)

---

## 📋 Возможности

### 🎥 Просмотр контента
- Поиск фильмов и сериалов через TMDB API
- Потоковое воспроизведение через HDRezka
- Выбор озвучки, качества (360p–1080p Ultra), скорости воспроизведения
- Автоматическое сохранение прогресса просмотра

### 📺 Трансляция на ТВ
- Отправка видео с телефона на телевизор по 4-значному коду
- Полноценный ТВ-плеер с управлением пультом (D-pad)
- YouTube-подобная навигация: панели озвучек, серий, качества
- Навигация по сетке серий с выбором сезонов
- Синхронизация истории просмотра с аккаунтом

### 👤 Аккаунты и синхронизация
- Авторизация пользователей
- Облачная синхронизация: история, избранное, позиции, комментарии
- Мерж данных при синхронизации (без потерь)

### 🔀 Свайп-режим
- Tinder-подобный выбор фильмов
- Свайп вправо — в избранное, влево — пропустить
- Персонализированные рекомендации

---

## 🏗️ Архитектура

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Клиент    │────▶│  Next.js API │────▶│  HDRezka    │
│  (React)    │     │   Routes     │     │  Python API │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    │
       │                    ▼
       │            ┌──────────────┐
       │            │   TMDB API   │
       │            └──────────────┘
       │
       ▼
┌─────────────┐
│  TV /cast   │  ◀── WebView (Android TV APK)
│  Receiver   │
└─────────────┘
```

---

## 📁 Структура проекта

```
├── app/
│   ├── page.tsx                # Главная — поиск, тренды
│   ├── cast/
│   │   └── page.tsx            # ТВ-приёмник (ввод кода, плеер)
│   ├── history/
│   │   └── page.tsx            # История просмотров
│   ├── api/
│   │   ├── auth/route.ts       # Авторизация
│   │   ├── sync/route.ts       # Облачная синхронизация данных
│   │   ├── tv-room/route.ts    # Комнаты для ТВ-трансляции
│   │   ├── tv-episodes/route.ts# Информация о сериях
│   │   ├── stream/route.ts     # Проксирование потоков
│   │   ├── tmdb-proxy/route.ts # Прокси к TMDB API
│   │   ├── swipe/route.ts      # API для свайп-режима
│   │   └── yohoho/route.ts     # Альтернативный плеер
│   ├── movie/[id]/page.tsx     # Страница фильма
│   ├── tv/[id]/page.tsx        # Страница сериала
│   ├── favorites/page.tsx      # Избранное
│   └── swipe/page.tsx          # Свайп-режим
│
├── components/
│   ├── movie-player.tsx        # Плеер фильмов
│   ├── tv-player.tsx           # Плеер сериалов
│   ├── send-to-tv.tsx          # Кнопка "На ТВ"
│   ├── navbar.tsx              # Навигация
│   ├── auth-context.tsx        # Контекст авторизации
│   ├── continue-watching.tsx   # Блок "Продолжить"
│   ├── recommendations.tsx     # Рекомендации
│   └── ...
│
├── lib/
│   ├── tmdb.ts                 # Работа с TMDB API
│   └── storage.ts              # Локальное хранилище + синхронизация
│
├── hdrezka_server.py           # Python API для HDRezka
├── users.json                  # Данные пользователей
├── next.config.mjs             # Конфиг Next.js (прокси, rewrites)
├── tailwind.config.ts          # Конфиг Tailwind CSS
└── package.json
```

---

## 🚀 Установка и запуск

### Требования
- Node.js 18+
- Python 3.10+
- npm или yarn

### 1. Клонирование

```bash
git clone https://github.com/EgorSanko/cinema_egor.git
cd cinema_egor
```

### 2. Установка зависимостей

```bash
# Node.js
npm install

# Python (HDRezka API)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install fastapi uvicorn httpx hdrezka
```

### 3. Настройка окружения

Создайте файл `.env.local`:

```env
TMDB_API_KEY=your_tmdb_api_key
```

### 4. Запуск

```bash
# HDRezka API (терминал 1)
python hdrezka_server.py

# Next.js (терминал 2)
npm run dev
```

Приложение доступно на `http://localhost:3000`

---

## 📺 Android TV

В папке `KinoTV/` находится проект Android-приложения — WebView-обёртка для `/cast`.

### Особенности:
- D-pad навигация с пульта
- Маппинг медиа-кнопок (play/pause, перемотка)
- Полноэкранный режим
- Кастомная иконка

### Сборка:
1. Откройте `KinoTV/` в Android Studio
2. Build → Build APK
3. Установите на ТВ через ADB или USB

---

## 🖥️ Деплой на сервер

### PM2 конфигурация

```bash
# Next.js
pm2 start .next/standalone/server.js --name kino-web

# HDRezka API
pm2 start hdrezka_server.py --name kino-api --interpreter python3

pm2 save
```

### Nginx (пример)

```nginx
server {
    server_name kino.lead-seek.ru;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

---

## 🔒 Безопасность

- `.env.local` — **не коммитится**, содержит API-ключи
- `user-data/` — **не коммитится**, содержит данные пользователей
- Пароли хешируются на сервере
- CORS настроен для продакшн-домена

---

## 🛠️ Технологии

| Компонент | Технология |
|-----------|------------|
| Frontend | Next.js 15, React, TypeScript |
| Стили | Tailwind CSS 4 |
| Видеоплеер | HLS.js |
| Метаданные | TMDB API |
| Контент | HDRezka (Python API) |
| Деплой | PM2, Nginx, Ubuntu |
| ТВ-приложение | Android WebView |

---

## 📝 Лицензия

Приватный проект. Все права защищены.

---

<p align="center">
  <b>🎬 Кинотеатр Егора</b> — Смотри что хочешь, где хочешь
</p>
