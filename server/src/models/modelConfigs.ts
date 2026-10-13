import { type ModelConfig, timestamps, required, normalizeStrings } from './postgresModel.js'
import { normalizeCpf, isValidCpf } from '../domain/cpf.js'

export const userConfig: ModelConfig = {
  table: 'users', columns: { _id: 'id', email: 'email', passwordHash: 'password_hash', name: 'name', role: 'role', ...timestamps },
  defaults: () => ({ name: '', role: 'operator' }),
  normalize: data => normalizeStrings(data, ['email']),
  validate: data => { required(data, ['email', 'passwordHash']); if (!['operator', 'admin'].includes(data.role)) throw new Error('Perfil inválido.') },
  serialize: data => { delete data.passwordHash; return data },
}
export const deliveryConfig: ModelConfig = {
  table: 'deliveries', columns: {
    _id: 'id', protocol: 'protocol', reservationId: 'reservation_id', assetTag: 'asset_tag', serialNumber: 'serial_number',
    recipient: 'recipient', recipientEmail: 'recipient_email', recipientCpf: 'recipient_cpf', recipientDepartment: 'recipient_department',
    equipment: 'equipment', model: 'model', brand: 'brand', accessories: 'accessories', status: 'status', isReturned: 'is_returned',
    returnedAt: 'returned_at', deliveredAt: 'delivered_at', deliveredBy: 'delivered_by', signature: 'signature', parts: 'parts', returnInspection: 'return_inspection', ...timestamps,
  },
  json: ['signature', 'parts', 'returnInspection'], dates: ['returnedAt', 'deliveredAt'],
  defaults: () => ({ accessories: '', status: 'entregue', isReturned: false, deliveredAt: new Date().toISOString(), parts: [] }),
  normalize: data => { normalizeStrings(data, ['recipientEmail']); if (data.recipientCpf != null) data.recipientCpf = normalizeCpf(data.recipientCpf) },
  validate: data => {
    required(data, ['protocol', 'assetTag', 'serialNumber', 'recipient', 'recipientEmail', 'recipientDepartment', 'equipment', 'model', 'brand'])
    if (data.recipientCpf != null && !isValidCpf(data.recipientCpf)) throw new Error('Informe um CPF válido para o responsável.')
  },
}
export const reservationConfig: ModelConfig = {
  table: 'reservations', columns: {
    _id: 'id', equipment: 'equipment', requesterName: 'requester_name', requesterEmail: 'requester_email', department: 'department', purpose: 'purpose',
    startDate: 'start_date', endDate: 'end_date', status: 'status', reviewedBy: 'reviewed_by', reviewedAt: 'reviewed_at', reviewNote: 'review_note',
    deliveryId: 'delivery_id', deliveryProtocol: 'delivery_protocol', ...timestamps,
  }, dates: ['reviewedAt'], defaults: () => ({ status: 'pendente' }), normalize: data => normalizeStrings(data, ['requesterEmail']),
  validate: data => required(data, ['equipment', 'requesterName', 'requesterEmail', 'department', 'purpose', 'startDate', 'endDate']),
}
export const auditConfig: ModelConfig = {
  table: 'delivery_deletion_audits', columns: {
    _id: 'id', deliveryId: 'delivery_id', deliverySnapshot: 'delivery_snapshot', protocol: 'protocol', assetTag: 'asset_tag', recipient: 'recipient',
    deletedByUserId: 'deleted_by_user_id', deletedByEmail: 'deleted_by_email', deletedAt: 'deleted_at',
  }, json: ['deliverySnapshot'], defaults: () => ({ deletedAt: new Date() }), normalize: data => normalizeStrings(data, ['deletedByEmail']),
  validate: data => { required(data, ['deliveryId', 'deletedByUserId', 'deletedByEmail']); if (!data.deliverySnapshot) throw new Error('Snapshot obrigatório.') },
}
