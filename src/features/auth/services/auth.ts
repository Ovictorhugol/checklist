import { apiGetProfile } from '../../../shared/api/api'
import { loginMicrosoft } from './microsoftAuth'

export type AuthUser = { email: string; name?: string; role: 'admin' | 'operator' }
const sessionKey = 'donato-microsoft-session'
const userRoleKey = 'donato-user-role'
const userNameKey = 'donato-user-name'

export function getSessionEmail(): string | null {
  return sessionStorage.getItem(sessionKey)
}
export function getUserRole(): 'admin' | 'operator' {
  return sessionStorage.getItem(userRoleKey) === 'admin' ? 'admin' : 'operator'
}
export function getUserName(): string | null {
  return sessionStorage.getItem(userNameKey)
}
export function clearSession() {
  sessionStorage.removeItem(sessionKey)
  sessionStorage.removeItem(userRoleKey)
  sessionStorage.removeItem(userNameKey)
}
function storeUserSession(user: AuthUser) {
  sessionStorage.setItem(sessionKey, user.email)
  sessionStorage.setItem(userRoleKey, user.role)
  if (user.name?.trim()) sessionStorage.setItem(userNameKey, user.name.trim())
  else sessionStorage.removeItem(userNameKey)
}
export async function authenticateMicrosoftAccount(): Promise<AuthUser> {
  clearSession()
  await loginMicrosoft()
  const { user } = await apiGetProfile()
  storeUserSession(user)
  return user
}
