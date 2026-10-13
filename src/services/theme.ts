export type Theme = 'light' | 'dark'
const themeKey = 'donato-theme'

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101923' : '#f7f9fc')
}

export function initializeTheme(): void {
  let saved: string | null = null
  try { saved = localStorage.getItem(themeKey) } catch { /* Storage may be disabled. */ }
  const theme = saved === 'dark' || saved === 'light' ? saved
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  applyTheme(theme)
}

export function saveTheme(theme: Theme): void {
  applyTheme(theme)
  try { localStorage.setItem(themeKey, theme) } catch { /* The toggle still works for this visit. */ }
}
