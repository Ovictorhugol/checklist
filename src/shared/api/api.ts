import type { DeletedDeliveryAudit, DeliveryRecord, NewDelivery, ReturnInspectionInput } from '../../features/deliveries/types/deliveryTypes'
import type { NewReservation, ReservationRecord, ReservationStatus } from '../../features/reservations/types/reservation'
import { getMicrosoftAccessToken } from '../../features/auth/services/microsoftAuth'

type AuthProfile = { email: string; name?: string; role: 'admin' | 'operator' }

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  let token: string
  try {
    token = await getMicrosoftAccessToken()
  } catch (error) {
    window.dispatchEvent(new Event('donato-session-expired'))
    throw error
  }
  if (token) headers.Authorization = `Bearer ${token}`
  let response: Response
  try {
    response = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new Error('Não foi possível conectar ao servidor. Nenhuma gravação foi confirmada. Tente novamente após verificar a conexão.')
  }
  const data = await response.json().catch(() => null)
  if (response.status === 401) {
    window.dispatchEvent(new Event('donato-session-expired'))
  }
  if (!response.ok || data === null) {
    throw new Error(data?.error || 'O servidor não confirmou a operação. Verifique a conexão e atualize os dados antes de tentar novamente.')
  }
  return data as T
}

export const apiGetProfile = () => request<{ user: AuthProfile }>('/auth/me')
export const apiGetDeliveries = () => request<DeliveryRecord[]>('/deliveries')
export const apiGetMyDeliveries = () => request<DeliveryRecord[]>('/deliveries/mine')
export const apiGetDeletedDeliveries = () => request<DeletedDeliveryAudit[]>('/deliveries/deleted')
export const apiRestoreDelivery = (auditId: string) => request<DeliveryRecord>(`/deliveries/deleted/${auditId}/restore`, 'POST')
export type DeliveryEmailState = {
  enabled: boolean
  job: null | { status: 'pending' | 'processing' | 'accepted' | 'failed' | 'review'; recipientEmail: string; attempts: number; acceptedAt?: string; lastError?: string }
}
export const apiGetDeliveryEmail = (id: string, type: 'delivery' | 'return' = 'delivery') => request<DeliveryEmailState>(`/deliveries/${id}/email?type=${type}`)
export const apiRetryDeliveryEmail = (id: string, type: 'delivery' | 'return' = 'delivery') => request<{ message: string }>(`/deliveries/${id}/email/retry?type=${type}`, 'POST')
export const apiCreateDelivery = (delivery: NewDelivery) => request<DeliveryRecord>('/deliveries', 'POST', delivery)
export const apiSaveReturnInspection = (id: string, inspection: ReturnInspectionInput) => request<DeliveryRecord>(`/deliveries/${id}/return`, 'PUT', inspection)
export const apiDeleteDelivery = (id: string) => request<{ message: string }>(`/deliveries/${id}`, 'DELETE')
export const apiGetReservations = () => request<ReservationRecord[]>('/reservations')
export const apiCreateReservation = (data: NewReservation) => request<ReservationRecord>('/reservations', 'POST', data)
export const apiRetryReservationGlpi = (id: string) => request<{ message: string }>(`/reservations/${id}/glpi/retry`, 'POST')
export const apiUpdateReservation = (id: string, status: Exclude<ReservationStatus, 'pendente'>, reviewNote = '') => request<ReservationRecord>(`/reservations/${id}`, 'PATCH', { status, reviewNote })
