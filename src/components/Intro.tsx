'use client'

import { useEffect, useState } from 'react'

// Plays the homepage reveal once per page load. The flag is module-level, so it
// survives client-side navigation — returning to the homepage from another page
// won't replay the fade. A full reload starts a fresh load and plays it again.
let played = false

export default function Intro({ children }: { children: React.ReactNode }) {
  const [animate] = useState(() => !played)

  useEffect(() => {
    played = true
  }, [])

  return <div className={animate ? 'intro' : undefined}>{children}</div>
}
