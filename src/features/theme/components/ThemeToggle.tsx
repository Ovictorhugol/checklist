import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { saveTheme, type Theme } from '../services/theme'
import '../styles/Theme.css'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const dark = theme === 'dark'
  const label = dark ? 'Ativar modo claro' : 'Ativar modo escuro'
  return (
    <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={() => {
      const next = dark ? 'light' : 'dark'
      saveTheme(next)
      setTheme(next)
    }}>
      {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
      <span>{dark ? 'Modo claro' : 'Modo escuro'}</span>
    </button>
  )
}
