import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Stori Travel',
    short_name: 'Stori Travel',
    description:
      'Plataforma inteligente de planejamento de viagens com IA, que atua como concierge digital para ajudar usuarios a descobrirem destinos e criarem roteiros personalizados.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      {
        src: '/images/stori-logo-transparent.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: '/images/stori-logo-transparent.png',
        sizes: '512x512',
        type: 'image/png'
      },
      {
        src: '/images/stori-logo-transparent.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  }
}
