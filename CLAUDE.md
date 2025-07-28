# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server with Turbopack (fastest)
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Architecture

This is a Next.js 15 personal portfolio website using the App Router with:

- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS v4
- **Icons**: React Icons (react-icons)
- **TypeScript**: Configured with path aliases (`@/*` maps to `./src/*`)

### Directory Structure

- `src/app/` - Next.js App Router pages
  - `layout.tsx` - Root layout with Header component and global styles
  - `page.tsx` - Home page
  - `about/page.tsx` - About page
- `src/components/` - Reusable React components
  - `Header.tsx` - Sticky navigation header with social links

### Key Patterns

- Uses TypeScript with strict configuration
- Path aliases configured for imports (`@/components/Header`)
- Tailwind classes for styling with responsive design
- Header component includes navigation and social media links (GitHub, LinkedIn)
- Clean, minimal design with gray color scheme