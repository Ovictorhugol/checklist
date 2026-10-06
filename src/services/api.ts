import type { DeletedDeliveryAudit, DeliveryRecord, NewDelivery, ReturnInspectionRecord } from '../domain/deliveryTypes'
import { microsoftAuthEnabled, getMicrosoftAccessToken } from './microsoftAuth'

const tokenKey = 'donato-auth-token'
export const getAuthToken = () => sessionStorage.getItem(tokenKey)
export const setAuthToken = (token: string) => sessionStorage.setItem(tokenKey, token)
export const clearAuthToken = () => sessionStorage.removeItem(tokenKey)

type AuthResponse = { token: string; user: { email: string; name?: string; role: 'admin' | 'operator' } }

async function request<T>(path: string, method = 'GET', body?: unknown, authenticated = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  let token = getAuthToken()
  if (authenticated && microsoftAuthEnabled) {
    try {
      token = await getMicrosoftAccessToken()
    } catch (error) {
      clearAuthToken()
      window.dispatchEvent(new Event('donato-session-expired'))
      throw error
    }
  }
  if (authenticated && token) headers.Authorization = `Bearer ${token}`
  let response: Response
  try {
    response = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new Error('Não foi possível conectar ao servidor. Nenhuma gravação foi confirmada. Tente novamente após verificar a conexão.')
  }
  const data = await response.json().catch(() => null)
  if (authenticated && response.status === 401) {
    clearAuthToken()
    window.dispatchEvent(new Event('donato-session-expired'))
  }
  if (!response.ok || data === null) {
    throw new Error(data?.error || 'O servidor não confirmou a operação. Verifique a conexão e atualize os dados antes de tentar novamente.')
  }
  return data as T
}

export async function apiRegister(email: string, password: string, name?: string) {
  const data = await request<AuthResponse>('/auth/register', 'POST', { email, password, name }, false)
  setAuthToken(data.token)
  return data
}
export async function apiLogin(email: string, password: string) {
  const data = await request<AuthResponse>('/auth/login', 'POST', { email, password }, false)
  setAuthToken(data.token)
  return data
}
export const apiChangePassword = (newPassword: string) => request<{ message: string }>('/auth/password', 'PATCH', { newPassword })
export const apiGetProfile = () => request<{ user: AuthResponse['user'] }>('/auth/me')
export const apiGetDeliveries = () => request<DeliveryRecord[]>('/deliveries')
export const apiGetMyDeliveries = () => request<DeliveryRecord[]>('/deliveries/mine')
export const apiGetDeletedDeliveries = () => request<DeletedDeliveryAudit[]>('/deliveries/deleted')
export const apiCreateDelivery = (delivery: NewDelivery) => request<DeliveryRecord>('/deliveries', 'POST', delivery)
export const apiSaveReturnInspection = (id: string, inspection: ReturnInspectionRecord) => request<DeliveryRecord>(`/deliveries/${id}/return`, 'PUT', inspection)
export const apiDeleteDelivery = (id: string) => request<{ message: string }>(`/deliveries/${id}`, 'DELETE')
