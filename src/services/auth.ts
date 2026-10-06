import { apiLogin, apiRegister, apiGetProfile, clearAuthToken, getAuthToken, setAuthToken } from './api'
import { loginMicrosoft, microsoftAuthEnabled } from './microsoftAuth'

export type AuthUser = { email: string; name?: string; role: 'admin' | 'operator' }
const sessionKey = 'donato-local-session'
const userRoleKey = 'donato-user-role'
const userNameKey = 'donato-user-name'

export function getLocalSession(): string | null {
  return getAuthToken() ? sessionStorage.getItem(sessionKey) : null
}
export function getUserRole(): 'admin' | 'operator' {
  return sessionStorage.getItem(userRoleKey) === 'admin' ? 'admin' : 'operator'
}
export function getUserName(): string | null {
  return sessionStorage.getItem(userNameKey)
}
export function logoutLocalSession() {
  clearAuthToken()
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
export async function authenticateLocalAccount(emailInput: string, password: string, createAccount: boolean): Promise<AuthUser> {
  const email = emailInput.trim().toLowerCase()
  const response = createAccount ? await apiRegister(email, password) : await apiLogin(email, password)
  storeUserSession(response.user)
  return response.user
}

export async function authenticateMicrosoftAccount(): Promise<AuthUser> {
  logoutLocalSession()
  await loginMicrosoft()
  const { user } = await apiGetProfile()
  // Only a session marker: actual tokens are managed and renewed by MSAL.
  if (microsoftAuthEnabled) setAuthToken('microsoft')
  storeUserSession(user)
  return user
}
