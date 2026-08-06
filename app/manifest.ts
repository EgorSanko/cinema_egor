import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'sapkeflykino',
    short_name: 'sapkeflykino',
    description: 'Смотрите фильмы и сериалы онлайн бесплатно в HD',
    start_url: '/',
    display: 'standalone',
    // Цвет заставки при запуске с главного экрана — тот же, что фон сайта,
    // иначе при открытии мигает чужим оттенком.
    background_color: '#0a0a0b',
    theme_color: '#a3e635',
    orientation: 'any',
    categories: ['entertainment'],
    // Были указаны logo-192/logo-512 с размерами '192x192'/'512x512', но сами
    // файлы — широкие надписи (192x50 и 512x133). Обещанного квадрата браузер
    // не получал, а maskable-иконка без полей обрезалась маской Android по краям.
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
