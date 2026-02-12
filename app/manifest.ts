import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'РљРёРЅРѕС‚РµР°С‚СЂ Р•РіРѕСЂР°',
    short_name: 'РљРёРЅРѕС‚РµР°С‚СЂ',
    description: 'РЎРјРѕС‚СЂРёС‚Рµ С„РёР»СЊРјС‹ Рё СЃРµСЂРёР°Р»С‹ РѕРЅР»Р°Р№РЅ Р±РµСЃРїР»Р°С‚РЅРѕ РІ HD',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#e11d48',
    orientation: 'any',
    categories: ['entertainment'],
    icons: [
      { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
      { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  }
}
