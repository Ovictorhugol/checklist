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
  restoreDelivery,
} from '../controllers/deliveryController.js'
import { authMiddleware, adminOnlyMiddleware } from '../middleware/authMiddleware.js'
import { getDeliveryEmail, retryDeliveryEmail } from '../controllers/deliveryEmailController.js'

const router = Router()

router.use(authMiddleware)

router.get('/', getAllDeliveries)
router.get('/mine', getMyDeliveries)
router.get('/deleted', adminOnlyMiddleware, getDeletedDeliveries)
router.post('/deleted/:id/restore', adminOnlyMiddleware, restoreDelivery)
router.get('/next-protocol', adminOnlyMiddleware, getNextProtocol)
router.get('/:id', getDeliveryById)
router.get('/:id/email', adminOnlyMiddleware, getDeliveryEmail)
router.post('/:id/email/retry', adminOnlyMiddleware, retryDeliveryEmail)
router.post('/', adminOnlyMiddleware, createDelivery)
router.put('/:id/return', adminOnlyMiddleware, saveReturnInspection)
router.delete('/:id', adminOnlyMiddleware, deleteDelivery)

export default router
