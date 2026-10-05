import { allocateProtocol, peekProtocol } from '../services/protocol.js'
import { validateDeliveryParts, validateReturnParts } from '../domain/inspection.js'
import type { Response } from 'express'
import type { ClientSession } from 'mongoose'
import { Delivery } from '../models/Delivery.js'
import { DeliveryDeletionAudit } from '../models/DeliveryDeletionAudit.js'
import type { AuthRequest } from '../middleware/authMiddleware.js'

export async function getAllDeliveries(req: AuthRequest, res: Response): Promise<void> {
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
      id: audit._id.toString(),
      ...audit,
      deliverySnapshot: audit.deliverySnapshot ?? {
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

    if (!delivery) {
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
    const {
      assetTag,
      serialNumber,
      recipient,
      recipientEmail,
      recipientDepartment,
      equipment,
      model,
      brand,
      parts,
    } = req.body

    if (![assetTag, serialNumber, recipient, recipientEmail, recipientDepartment, equipment, model, brand].every((value) => typeof value === 'string' && !!value.trim())) {
      res.status(400).json({ error: 'Preencha todos os campos obrigatórios da entrega e do responsável.' })
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
    const protocol = await allocateProtocol()

    const newDelivery = await Delivery.create({
      protocol,
      assetTag,
      serialNumber,
      recipient,
      recipientEmail: normalizedRecipientEmail,
      recipientDepartment,
      equipment,
      model,
      brand,
      status: 'entregue',
      isReturned: false,
      deliveredAt: new Date().toISOString(),
      deliveredBy: req.user?.email || 'Sistema',
      parts: validatedParts,
    })

    res.status(201).json(newDelivery.toJSON())
  } catch (error) {
    console.error('Erro ao cadastrar conferência:', error)
    res.status(500).json({ error: 'Erro interno ao salvar conferência no MongoDB.' })
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
    const normalizedDate = new Date(returnDate).toISOString()
    // A condição no update impede que duas requisições sobrescrevam a mesma devolução.
    const updated = await Delivery.findOneAndUpdate(
      { _id: id, status: { $ne: 'devolvido' }, isReturned: { $ne: true }, returnInspection: null },
      { $set: {
        status: 'devolvido', isReturned: true, returnedAt: normalizedDate,
        returnInspection: { returnedAt: normalizedDate, inspectedBy: req.user!.email, parts: validatedParts },
      } },
      { new: true, runValidators: true }
    )
    if (!updated) {
      res.status(409).json({ error: 'Esta entrega já foi devolvida ou removida. Atualize a lista.' })
      return
    }
    res.status(200).json(updated.toJSON())
  } catch (error) {
    console.error('Erro ao salvar devolução:', error)
    res.status(500).json({ error: 'Erro interno ao registrar devolução no MongoDB.' })
  }
}

export async function deleteDelivery(req: AuthRequest, res: Response): Promise<void> {
  let session: ClientSession | undefined
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
