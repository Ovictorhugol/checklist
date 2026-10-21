export function glpiEnabled(): boolean { return process.env.GLPI_ENABLED === 'true' }

export function getGlpiConfig() {
  const base = process.env.GLPI_BASE_URL?.trim()
  if (!base) throw new Error('Configure GLPI_BASE_URL.')
  let url: URL
  try { url = new URL(base) } catch { throw new Error('GLPI_BASE_URL inválida.') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('GLPI_BASE_URL inválida.')
  const baseUrl = url.href.replace(/\/+$/, '')
  const appToken = process.env.GLPI_APP_TOKEN?.trim()
  const userToken = process.env.GLPI_USER_TOKEN?.trim()
  if (!appToken || !userToken) throw new Error('Configure GLPI_APP_TOKEN e GLPI_USER_TOKEN.')
  const optionalId = (key: string, allowZero = false) => {
    const value = process.env[key]?.trim()
    if (!value) return undefined
    const id = Number(value)
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id < (allowZero ? 0 : 1)) throw new Error(`Configure ${key} com um ID válido.`)
    return id
  }
  const categoryName = process.env.GLPI_CATEGORY_NAME?.trim() || 'Hardware'
  return { baseUrl, apiUrl: `${baseUrl}/apirest.php`, appToken, userToken, categoryName, categoryId: optionalId('GLPI_CATEGORY_ID'), entityId: optionalId('GLPI_ENTITY_ID', true), groupId: optionalId('GLPI_GROUP_ID') }
}
