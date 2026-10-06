import { Router } from 'express'
import {
  getAllDeliveries,
  getMyDeliveries,
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
router.get('/mine', getMyDeliveries)
router.get('/deleted', adminOnlyMiddleware, getDeletedDeliveries)
router.get('/next-protocol', adminOnlyMiddleware, getNextProtocol)
router.get('/:id', getDeliveryById)
router.post('/', adminOnlyMiddleware, createDelivery)
router.put('/:id/return', adminOnlyMiddleware, saveReturnInspection)
router.delete('/:id', adminOnlyMiddleware, deleteDelivery)

export default router
