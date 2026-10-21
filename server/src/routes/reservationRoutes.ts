import { Router } from 'express'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { createReservation, listReservations, updateReservation } from '../controllers/reservationController.js'
import { retryReservationGlpi } from '../controllers/reservationGlpiController.js'

const router = Router()
router.use(authMiddleware)
router.get('/', listReservations)
router.post('/', createReservation)
router.post('/:id/glpi/retry', retryReservationGlpi)
router.patch('/:id', updateReservation)
export default router
