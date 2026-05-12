import './globals.css'
import { Instrument_Serif, Inter, JetBrains_Mono } from 'next/font/google'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const instrumentSerif = Instrument_Serif({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-instrument-serif',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata = {
  metadataBase: new URL('https://brodheadw.github.io'),
  title: { default: 'Will Brodhead', template: '%s · Will Brodhead' },
  description:
    'Fullstack SWE & Quant. Complex systems and high-throughput data pipelines in Rust, C++, and Python.',
  openGraph: {
    title: 'Will Brodhead',
    description:
      'Fullstack SWE & Quant. Complex systems and high-throughput data pipelines in Rust, C++, and Python.',
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
      className={`${instrumentSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-bg text-fg antialiased">
        <div className="mx-auto max-w-5xl px-6 md:px-10">
          <Header />
          <main className="py-12 md:py-20">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  )
}
