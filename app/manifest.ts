import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'sapkeflykino',
    short_name: 'sapkeflykino',
    description: 'Смотрите фильмы и сериалы онлайн бесплатно в HD',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f1419',
    theme_color: '#a3e635',
    orientation: 'any',
    categories: ['entertainment'],
    icons: [
      { src: '/logo-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/logo-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
