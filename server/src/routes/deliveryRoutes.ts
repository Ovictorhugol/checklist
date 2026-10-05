import { Router } from 'express'
import {
  getAllDeliveries,
  getDeletedDeliveries,
  getDeliveryById,
  getNextProtocol,
  createDelivery,
  saveReturnInspection,
  deleteDelivery,
} from '../controllers/deliveryController.js'
import { authMiddleware, adminOnlyMiddleware } from '../middleware/authMiddleware.js'

const router = Router()

router.use(authMiddleware)

router.get('/', getAllDeliveries)
router.get('/deleted', adminOnlyMiddleware, getDeletedDeliveries)
router.get('/next-protocol', getNextProtocol)
router.get('/:id', getDeliveryById)
router.post('/', createDelivery)
router.put('/:id/return', saveReturnInspection)
router.delete('/:id', adminOnlyMiddleware, deleteDelivery)

export default router
