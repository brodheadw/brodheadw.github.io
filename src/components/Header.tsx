// src/components/Header.tsx
import Link from 'next/link'
import { FaGithub, FaLinkedin } from 'react-icons/fa'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm shadow-sm">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        {/* Your name */}
        <h1 className="text-xl font-bold">
          <Link href="/">Will Brodhead</Link>
        </h1>

        {/* Nav links + icons */}
        <nav className="flex items-center space-x-4">
          <Link
            href="/"
            className="hover:text-blue-600 transition-colors"
          >
            Home
          </Link>
          <Link
            href="/about"
            className="hover:text-blue-600 transition-colors"
          >
            About
          </Link>
          <a
            href="https://github.com/brodheadw"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-800 transition-colors"
          >
            <FaGithub size={20} />
          </a>
          <a
            href="https://linkedin.com/in/brodheadw"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-blue-700 transition-colors"
          >
            <FaLinkedin size={20} />
          </a>
        </nav>
      </div>
    </header>
  )
}
