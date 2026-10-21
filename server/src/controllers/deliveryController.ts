import { validateSignature, recordSignature } from '../domain/signature.js'
import { allocateProtocol, peekProtocol } from '../services/protocol.js'
import { validateDeliveryParts, validateReturnParts } from '../domain/inspection.js'
import type { Response } from 'express'
import { isValidRecordId } from '../models/postgresModel.js'
import { type DatabaseSession } from '../config/postgres.js'
import { createReservedDelivery, ReservationDeliveryConflict } from '../services/reservationDelivery.js'
import { Delivery } from '../models/Delivery.js'
import { DeliveryDeletionAudit } from '../models/DeliveryDeletionAudit.js'
import type { AuthRequest } from '../middleware/authMiddleware.js'
import { isValidCpf, normalizeCpf } from '../domain/cpf.js'
import { restoreArchivedDelivery, DeliveryRestoreError, isRestorableSnapshot } from '../services/restoreDelivery.js'
import { equipmentPossessionError } from '../services/equipmentPossession.js'
import { getEquipmentName } from '../domain/equipment.js'

export async function getAllDeliveries(req: AuthRequest, res: Response): Promise<void> {
  return listDeliveries(req, res, req.user?.role !== 'admin')
}

export async function getMyDeliveries(req: AuthRequest, res: Response): Promise<void> {
  return listDeliveries(req, res, true)
}

async function listDeliveries(req: AuthRequest, res: Response, personal: boolean): Promise<void> {
  try {
    const { status } = req.query
    let filter: Record<string, any> = {}

    if (status === 'entregue' || status === 'em_posse') {
      filter = {
        $or: [
          { status: 'entregue' },
          { isReturned: false },
          { returnInspection: { $exists: false } },
        ],
      }
    } else if (status === 'devolvido') {
      filter = {
        $or: [
          { status: 'devolvido' },
          { isReturned: true },
          { returnInspection: { $exists: true, $ne: null } },
        ],
      }
    }

    if (personal) {
      if (!req.user?.email) {
        res.status(401).json({ error: 'Não autenticado.' })
        return
      }
      filter.recipientEmail = req.user.email.trim().toLowerCase()
    }
    const deliveries = await Delivery.find(filter).sort({ createdAt: -1 })
    res.status(200).json(deliveries.map((item) => item.toJSON()))
  } catch (error) {
    console.error('Erro ao listar conferências:', error)
    res.status(500).json({ error: 'Erro ao buscar conferências no banco.' })
  }
}

export async function getDeletedDeliveries(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ error: 'Acesso negado: apenas administradores podem consultar entregas excluídas.' })
      return
    }

    const audits = await DeliveryDeletionAudit.find().sort({ deletedAt: -1 }).lean()
    res.status(200).json(audits.map((audit) => ({
      ...audit,
      id: audit._id.toString(),
      canRestore: !audit.restoredAt && isRestorableSnapshot(audit.deliverySnapshot),
      deliverySnapshot: audit.deliverySnapshot ? { ...audit.deliverySnapshot, equipment: getEquipmentName(audit.deliverySnapshot.equipment || '') } : {
        id: audit.deliveryId,
        protocol: audit.protocol || '',
        assetTag: audit.assetTag || '',
        recipient: audit.recipient || '',
        equipment: '',
        serialNumber: '',
        deliveredAt: '',
        parts: [],
      },
      _id: undefined,
    })))
  } catch (error) {
    console.error('Erro ao buscar entregas excluídas:', error)
    res.status(500).json({ error: 'Erro ao buscar entregas excluídas.' })
  }
}

export async function getNextProtocol(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const nextProtocol = await peekProtocol()
    res.status(200).json({ nextProtocol })
  } catch (error) {
    console.error('Erro ao gerar próximo protocolo:', error)
    res.status(500).json({ error: 'Erro ao calcular próximo protocolo.' })
  }
}

export async function getDeliveryById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const delivery = await Delivery.findById(id)

    if (!delivery || (req.user?.role !== 'admin' &&
      delivery.recipientEmail?.trim().toLowerCase() !== req.user?.email.trim().toLowerCase())) {
      res.status(404).json({ error: 'Conferência não encontrada.' })
      return
    }

    res.status(200).json(delivery.toJSON())
  } catch (error) {
    console.error('Erro ao buscar conferência:', error)
    res.status(500).json({ error: 'Erro ao buscar conferência.' })
  }
}

export async function createDelivery(req: AuthRequest, res: Response): Promise<void> {
  try {
    const reservationId = req.body.reservationId
    if (reservationId !== undefined && (typeof reservationId !== 'string' || !isValidRecordId(reservationId))) {
      res.status(400).json({ error: 'Reserva inválida para vincular à entrega.' }); return
    }
    const {
      assetTag,
      serialNumber,
      recipient,
      recipientEmail,
      recipientCpf,
      recipientDepartment,
      equipment,
      model,
      brand,
      accessories,
      parts,
    } = req.body

    if (![assetTag, serialNumber, recipient, recipientEmail, recipientDepartment, equipment, model, brand].every((value) => typeof value === 'string' && !!value.trim())) {
      res.status(400).json({ error: 'Preencha todos os campos obrigatórios da entrega e do responsável.' })
      return
    }

    if (!isValidCpf(recipientCpf)) {
      res.status(400).json({ error: 'Informe um CPF válido para o responsável.' })
      return
    }
    const normalizedRecipientEmail = String(recipientEmail).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedRecipientEmail)) {
      res.status(400).json({ error: 'Informe um e-mail válido para o responsável.' })
      return
    }

    let validatedParts
    try {
      validatedParts = validateDeliveryParts(equipment.trim(), parts)
    } catch (error) {
      res.status(400).json({ error: (error as Error).message })
      return
    }
    let validatedSignature
    try {
      validatedSignature = validateSignature(req.body.signature)
      if (validatedSignature.signerName !== recipient.trim()) throw new Error('A assinatura de entrega deve identificar o responsável pelo recebimento.')
    } catch (error) {
      res.status(400).json({ error: (error as Error).message })
      return
    }
    const deliveredAt = new Date()
    const protocol = await allocateProtocol(deliveredAt)

    const details = {
      protocol,
      assetTag,
      serialNumber,
      recipient,
      recipientEmail: normalizedRecipientEmail,
      recipientCpf: normalizeCpf(recipientCpf),
      recipientDepartment,
      equipment: equipment.trim(),
      model,
      brand,
      accessories: typeof accessories === 'string' ? accessories.trim() : '',
      status: 'entregue',
      isReturned: false,
      deliveredAt: deliveredAt.toISOString(),
      deliveredBy: req.user?.email || 'Sistema',
      parts: validatedParts,
    }
    const signedDetails = { ...details, ...(reservationId ? { reservationId } : {}), signature: recordSignature(validatedSignature, { ...details, ...(reservationId ? { reservationId } : {}) }, req.user!.email) }
    const newDelivery = reservationId ? await createReservedDelivery(reservationId, signedDetails) : await Delivery.create(signedDetails)

    res.status(201).json(newDelivery.toJSON())
  } catch (error) {
    if (error instanceof ReservationDeliveryConflict) { res.status(409).json({ error: error.message }); return }
    const possessionError = equipmentPossessionError(error)
    if (possessionError) { res.status(409).json({ error: possessionError }); return }
    console.error('Erro ao cadastrar conferência:', error)
    res.status(500).json({ error: 'Erro interno ao salvar conferência no PostgreSQL.' })
  }
}

export async function saveReturnInspection(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const { parts, returnedAt } = req.body
    const delivery = await Delivery.findById(id)
    if (!delivery) {
      res.status(404).json({ error: 'Conferência não encontrada.' })
      return
    }
    if (delivery.isReturned || delivery.status === 'devolvido' || delivery.returnInspection) {
      res.status(409).json({ error: 'Esta entrega já foi devolvida.' })
      return
    }
    let validatedParts
    try {
      validatedParts = validateReturnParts(delivery.parts, parts)
    } catch (error) {
      res.status(400).json({ error: (error as Error).message })
      return
    }
    const returnDate = returnedAt === undefined ? new Date().toISOString() : returnedAt
    if (typeof returnDate !== 'string' || !Number.isFinite(Date.parse(returnDate)) || Date.parse(returnDate) < Date.parse(delivery.deliveredAt) || Date.parse(returnDate) > Date.now() + 60_000) {
      res.status(400).json({ error: 'Informe uma data de devolução válida, posterior à entrega e não futura.' })
      return
    }
    let validatedSignature
    try {
      validatedSignature = validateSignature(req.body.signature)
      if (validatedSignature.signerName !== delivery.recipient.trim()) throw new Error('A assinatura da devolução deve identificar a pessoa que estava em posse do equipamento.')
    } catch (error) {
      res.status(400).json({ error: (error as Error).message })
      return
    }
    const normalizedDate = new Date(returnDate).toISOString()
    const signedReturn = recordSignature(validatedSignature, {
      delivery: typeof delivery.toObject === 'function' ? delivery.toObject() : delivery,
      returnedAt: normalizedDate, parts: validatedParts,
    }, req.user!.email)
    // A condição no update impede que duas requisições sobrescrevam a mesma devolução.
    const updated = await Delivery.findOneAndUpdate(
      { _id: id, status: { $ne: 'devolvido' }, isReturned: { $ne: true }, returnInspection: null },
      { $set: {
        status: 'devolvido', isReturned: true, returnedAt: normalizedDate,
        returnInspection: { returnedAt: normalizedDate, inspectedBy: req.user!.email, parts: validatedParts, signature: signedReturn },
      } }
    )
    if (!updated) {
      res.status(409).json({ error: 'Esta entrega já foi devolvida ou removida. Atualize a lista.' })
      return
    }
    res.status(200).json(updated.toJSON())
  } catch (error) {
    console.error('Erro ao salvar devolução:', error)
    res.status(500).json({ error: 'Erro interno ao registrar devolução no PostgreSQL.' })
  }
}

export async function deleteDelivery(req: AuthRequest, res: Response): Promise<void> {
  let session: DatabaseSession | undefined
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({
        error: 'Acesso negado: apenas o usuário administrador tem permissão para excluir entregas.',
      })
      return
    }

    const user = req.user
    const { id } = req.params
    let notFound = false
    session = await Delivery.startSession()
    const activeSession = session

    await activeSession.withTransaction(async () => {
      notFound = false
      const delivery = await Delivery.findById(id).session(activeSession)

      if (!delivery) {
        notFound = true
        return
      }

      await DeliveryDeletionAudit.create(
        [{
          deliveryId: delivery._id.toString(),
          deliverySnapshot: { ...delivery.toObject(), id: delivery._id.toString() },
          deletedByUserId: user.id,
          deletedByEmail: user.email,
          deletedAt: new Date(),
        }],
        { session: activeSession }
      )
      await delivery.deleteOne({ session: activeSession })
    })

    if (notFound) {
      res.status(404).json({ error: 'Conferência não encontrada.' })
      return
    }

    res.status(200).json({ message: 'Conferência excluída com sucesso.' })
  } catch (error) {
    console.error('Erro ao deletar conferência:', error)
    res.status(500).json({ error: 'Erro ao excluir conferência.' })
  } finally {
    await session?.endSession()
  }
}

export async function restoreDelivery(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user || req.user.role !== 'admin') { res.status(403).json({ error: 'Somente administradores podem recuperar entregas.' }); return }
  if (!isValidRecordId(req.params.id)) { res.status(400).json({ error: 'Registro de exclusão inválido.' }); return }
  try {
    const delivery = await restoreArchivedDelivery(req.params.id, req.user)
    res.status(200).json(delivery.toJSON())
  } catch (error) {
    if (error instanceof DeliveryRestoreError) { res.status(error.status).json({ error: error.message }); return }
    console.error('Erro ao recuperar entrega:', error)
    res.status(500).json({ error: 'Não foi possível recuperar a entrega. Nenhuma alteração foi confirmada.' })
  }
}
