export type ReservationStatus = 'pendente' | 'aprovada' | 'recusada' | 'cancelada'
export interface NewReservation {
  equipment: string
  requesterName: string
  department: string
  purpose: string
  startDate: string
  endDate: string
}
export interface ReservationRecord extends NewReservation {
  id: string
  requesterEmail: string
  status: ReservationStatus
  createdAt: string
  updatedAt: string
  reviewedBy?: string
  reviewedAt?: string
  reviewNote?: string
  deliveryId?: string
  deliveryProtocol?: string
  glpiEnabled?: boolean
  glpiStatus?: 'pending' | 'processing' | 'created' | 'failed' | 'review' | null
  glpiTicketId?: number | null
  glpiTicketUrl?: string | null
  glpiError?: string | null
}
