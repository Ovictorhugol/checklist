import { Router } from 'express'
import { register, login, getProfile, changePassword } from '../controllers/authController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { isMicrosoftAuth } from '../config/identity.js'

const router = Router()

router.use((req, res, next) => {
  if (isMicrosoftAuth() && req.path !== '/me') {
    res.status(403).json({ error: 'Use o login Microsoft. Contas e senhas são administradas pela organização.' })
    return
  }
  next()
})

router.post('/register', register)
router.post('/login', login)
router.get('/me', authMiddleware, getProfile)
router.patch('/password', authMiddleware, changePassword)

export default router
