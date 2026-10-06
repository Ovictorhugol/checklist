import { getJwtSecret } from '../config/environment.js'
import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { User } from '../models/User.js'
import type { AuthRequest } from '../middleware/authMiddleware.js'
import { isMicrosoftAuth } from '../config/identity.js'

function generateToken(userId: string, email: string, role: string) {
  const secret = getJwtSecret()
  return jwt.sign({ id: userId, email, role }, secret, { expiresIn: '7d' })
}

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, name } = req.body

    if (!email || !password) {
      res.status(400).json({ error: 'E-mail e senha são obrigatórios.' })
      return
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'A senha deve conter no mínimo 8 caracteres.' })
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
    const existingUser = await User.findOne({ email: normalizedEmail })

    if (existingUser) {
      res.status(409).json({ error: 'Já existe uma conta cadastrada com este e-mail.' })
      return
    }

    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(password, salt)

    const newUser = await User.create({
      email: normalizedEmail,
      passwordHash,
      name: name?.trim() || '',
    })

    const token = generateToken(newUser._id.toString(), newUser.email, newUser.role)

    res.status(201).json({
      message: 'Conta criada com sucesso!',
      token,
      user: newUser.toJSON(),
    })
  } catch (error) {
    console.error('Erro no registro:', error)
    res.status(500).json({ error: 'Erro interno ao processar o cadastro.' })
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      res.status(400).json({ error: 'Informe e-mail e senha.' })
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
    const user = await User.findOne({ email: normalizedEmail })

    if (!user) {
      res.status(401).json({ error: 'E-mail ou senha incorretos.' })
      return
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash)
    if (!passwordMatch) {
      res.status(401).json({ error: 'E-mail ou senha incorretos.' })
      return
    }

    const token = generateToken(user._id.toString(), user.email, user.role)

    res.status(200).json({
      message: 'Login realizado com sucesso!',
      token,
      user: user.toJSON(),
    })
  } catch (error) {
    console.error('Erro no login:', error)
    res.status(500).json({ error: 'Erro interno ao realizar login.' })
  }
}

export async function getProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Não autenticado' })
      return
    }

    if (isMicrosoftAuth()) {
      res.status(200).json({ user: req.user })
      return
    }
    const user = await User.findById(req.user.id)
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado' })
      return
    }

    res.status(200).json({ user: user.toJSON() })
  } catch (error) {
    console.error('Erro ao buscar perfil:', error)
    res.status(500).json({ error: 'Erro ao buscar dados do perfil.' })
  }
}

export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Não autenticado.' })
      return
    }

    const { newPassword } = req.body
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ error: 'A nova senha deve conter no mínimo 8 caracteres.' })
      return
    }

    const user = await User.findById(req.user.id)
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado.' })
      return
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10)
    await user.save()

    res.status(200).json({ message: 'Senha atualizada com sucesso.' })
  } catch (error) {
    console.error('Erro ao atualizar senha:', error)
    res.status(500).json({ error: 'Erro interno ao atualizar a senha.' })
  }
}
