import { apiLogin, apiRegister, clearAuthToken, getAuthToken } from './api'

export type AuthUser = { email: string; role: 'admin' | 'operator' }
const sessionKey = 'donato-local-session'
const userRoleKey = 'donato-user-role'

export function getLocalSession(): string | null {
  return getAuthToken() ? sessionStorage.getItem(sessionKey) : null
}
export function getUserRole(): 'admin' | 'operator' {
  return sessionStorage.getItem(userRoleKey) === 'admin' ? 'admin' : 'operator'
}
export function logoutLocalSession() {
  clearAuthToken()
  sessionStorage.removeItem(sessionKey)
  sessionStorage.removeItem(userRoleKey)
}
export async function authenticateLocalAccount(emailInput: string, password: string, createAccount: boolean): Promise<AuthUser> {
  const email = emailInput.trim().toLowerCase()
  const response = createAccount ? await apiRegister(email, password) : await apiLogin(email, password)
  sessionStorage.setItem(sessionKey, response.user.email)
  sessionStorage.setItem(userRoleKey, response.user.role)
  return response.user
}
