import './globals.css'
import { Archivo_Black, Inter, JetBrains_Mono } from 'next/font/google'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const archivoBlack = Archivo_Black({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata = {
  metadataBase: new URL('https://brodheadw.github.io'),
  title: { default: 'Will Brodhead', template: '%s · Will Brodhead' },
  description:
    'Systems and quant engineer. Rust, C++, Python.',
  openGraph: {
    title: 'Will Brodhead',
    description: 'Systems and quant engineer. Rust, C++, Python.',
    url: 'https://brodheadw.github.io',
    siteName: 'Will Brodhead',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${archivoBlack.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-bg text-fg antialiased">
        <div className="page-shadow" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-6 md:px-10">
          <Header />
          <main className="py-12 md:py-20">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  )
}
