import { Router } from 'express'
import { register, login, getProfile, changePassword } from '../controllers/authController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const router = Router()

router.post('/register', register)
router.post('/login', login)
router.get('/me', authMiddleware, getProfile)
router.patch('/password', authMiddleware, changePassword)

export default router
