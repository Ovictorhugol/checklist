export function normalizeCpf(value: string): string {
  return value.replace(/[.\-\s]/g, '')
}

export function isValidCpf(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const digits = normalizeCpf(value)
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false
  for (const length of [9, 10]) {
    let sum = 0
    for (let index = 0; index < length; index++) sum += Number(digits[index]) * (length + 1 - index)
    const remainder = (sum * 10) % 11
    if (Number(digits[length]) !== (remainder === 10 ? 0 : remainder)) return false
  }
  return true
}

export function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  return digits.replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}
