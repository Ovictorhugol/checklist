import { Router } from 'express'
import { getProfile } from '../controllers/authController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const router = Router()
router.get('/me', authMiddleware, getProfile)

export default router
