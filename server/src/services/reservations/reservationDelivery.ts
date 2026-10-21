import { newId } from '../../models/postgresModel.js'
import { Delivery } from '../../models/Delivery.js'
import { Reservation } from '../../models/Reservation.js'
import { getEquipmentName } from '../../domain/inspection/equipment.js'

export class ReservationDeliveryConflict extends Error {
  constructor() { super('A reserva deve estar aprovada, sem entrega vinculada, e corresponder ao equipamento, nome, e-mail e setor do solicitante. Atualize a lista de reservas.') }
}

// A reserva e a entrega são confirmadas juntas, inclusive em disputas com cancelamento.
export async function createReservedDelivery(reservationId: string, data: Record<string, unknown>) {
  const session = await Delivery.startSession()
  const deliveryId = newId()
  let saved: InstanceType<typeof Delivery> | undefined
  try {
    await session.withTransaction(async () => {
      const reservation = await Reservation.findOneAndUpdate({
        _id: reservationId, status: 'aprovada', deliveryId: null,
        requesterEmail: data.recipientEmail,
        requesterName: data.recipient, department: data.recipientDepartment,
      }, { $set: { deliveryId: deliveryId.toString(), deliveryProtocol: data.protocol } }, { session })
      if (!reservation) throw new ReservationDeliveryConflict()
      if (getEquipmentName(reservation.equipment) !== data.equipment) throw new ReservationDeliveryConflict()
      const records = await Delivery.create([{ ...data, _id: deliveryId, reservationId }], { session })
      saved = records[0]
    })
    if (!saved) throw new Error('A entrega da reserva não foi confirmada.')
    return saved
  } finally { await session.endSession() }
}
