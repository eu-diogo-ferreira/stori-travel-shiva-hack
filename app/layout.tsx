import type { Metadata, Viewport } from 'next'
import { Inter as FontSans } from 'next/font/google'

import { Analytics } from '@vercel/analytics/next'

import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

import { SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'

import AppSidebar from '@/components/app-sidebar'
import ArtifactRoot from '@/components/artifact/artifact-root'
import Header from '@/components/header'
import { ThemeProvider } from '@/components/theme-provider'

import './globals.css'

const fontSans = FontSans({
  subsets: ['latin'],
  variable: '--font-sans'
})

const title = 'Stori Travel | Planeje sua viagem com IA'
const description =
  'Descubra destinos, crie roteiros personalizados e planeje sua viagem com a inteligencia artificial da Stori Travel.'
const keywords = [
  'Stori Travel',
  'planejamento de viagens',
  'roteiro de viagem',
  'concierge digital',
  'inteligencia artificial',
  'travel planner'
]

function resolveMetadataBase() {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://stori-travel-shiva-hack.vercel.app/'
  try {
    return new URL(url)
  } catch {
    return new URL('https://stori-travel-shiva-hack.vercel.app/')
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title,
  description,
  keywords,
  authors: [{ name: 'Stori Travel' }],
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/images/stori-logo-transparent.png', type: 'image/png' },
      { url: '/favicon.ico' }
    ],
    shortcut: ['/images/stori-logo-transparent.png'],
    apple: [{ url: '/images/stori-logo-transparent.png' }]
  },
  openGraph: {
    title,
    description,
    type: 'website',
    url: '/',
    siteName: 'Stori Travel',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Stori Travel'
      }
    ]
  },
  twitter: {
    title,
    description,
    card: 'summary_large_image',
    images: ['/og.png']
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  let user = null
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = await createClient()
    const {
      data: { user: supabaseUser }
    } = await supabase.auth.getUser()
    user = supabaseUser
  }

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={cn(
          'min-h-screen flex flex-col font-sans antialiased overflow-hidden',
          fontSans.variable
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SidebarProvider defaultOpen>
            <AppSidebar hasUser={!!user} />
            <div className="flex flex-col flex-1 min-w-0">
              <Header user={user} />
              <main className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
                <ArtifactRoot>{children}</ArtifactRoot>
              </main>
            </div>
          </SidebarProvider>
          <Toaster />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
