export function equipmentPossessionError(error: unknown): string | undefined {
  const details = error as { code?: string; constraint?: string } | null
  if (details?.code !== '23505') return undefined
  if (details.constraint === 'deliveries_active_asset_tag_key') {
    return 'Este patrimônio já está em posse de alguém. Registre a devolução antes de emprestá-lo novamente.'
  }
  if (details.constraint === 'deliveries_active_serial_number_key') {
    return 'Este número de série já está em posse de alguém. Registre a devolução antes de emprestá-lo novamente.'
  }
  return undefined
}
