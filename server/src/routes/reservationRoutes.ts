import { Router } from 'express'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { createReservation, listReservations, updateReservation } from '../controllers/reservationController.js'

const router = Router()
router.use(authMiddleware)
router.get('/', listReservations)
router.post('/', createReservation)
router.patch('/:id', updateReservation)
export default router
