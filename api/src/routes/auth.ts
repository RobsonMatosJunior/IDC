import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { authenticate } from '../middleware/auth';
import { audit } from '../lib/audit';
import { asyncHandler } from '../lib/asyncHandler';
import { User } from '../types';

const router = Router();

function signToken(user: User): string {
  return jwt.sign(
    { userId: user.id, role: user.role, pwv: user.pw_version ?? 0 },
    process.env.JWT_SECRET as string,
    { expiresIn: '2h' }
  );
}

router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password } = req.body ?? {};
  if (!name || !email || !password) {
    res.status(400).json({ error: 'name, email e password são obrigatórios' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await db.query<User>(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'member') RETURNING *`,
      [name, email, passwordHash]
    );
    const user = rows[0];
    await audit(user.id, 'user.register', 'user', user.id, {}, req.ip);
    res.status(201).json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') {
      res.status(409).json({ error: 'Email já cadastrado' });
      return;
    }
    throw err;
  }
}));

router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: 'email e password são obrigatórios' });
    return;
  }

  const { rows } = await db.query<User>('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: 'Credenciais inválidas' });
    return;
  }

  await audit(user.id, 'user.login', 'user', user.id, {}, req.ip);
  res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));

router.get('/me', authenticate, (req: Request, res: Response) => {
  const { id, name, email, role } = req.user!;
  res.json({ id, name, email, role });
});

router.post('/change-password', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'currentPassword e newPassword são obrigatórios' });
    return;
  }

  const user = req.user!;
  if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
    res.status(401).json({ error: 'Senha atual incorreta' });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  const { rows } = await db.query<User>(
    'UPDATE users SET password_hash = $1, pw_version = pw_version + 1 WHERE id = $2 RETURNING *',
    [newHash, user.id]
  );
  await audit(user.id, 'user.change_password', 'user', user.id, {}, req.ip);
  res.json({ token: signToken(rows[0]) });
}));

export default router;
