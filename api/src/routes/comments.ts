import { Router, Request, Response } from 'express';
import sanitizeHtml from 'sanitize-html';
import { db } from '../db';
import { authenticate } from '../middleware/auth';
import { validateUUID } from '../lib/validateUUID';
import { requireFeature } from '../lib/featureFlags';
import { audit } from '../lib/audit';
import { asyncHandler } from '../lib/asyncHandler';
import { Comment } from '../types';

const router = Router();

router.get('/idea/:id', validateUUID(), asyncHandler(async (req: Request, res: Response) => {
  const { rows } = await db.query<Comment>(
    'SELECT * FROM comments WHERE idea_id = $1 ORDER BY created_at ASC',
    [req.params.id]
  );
  res.json(rows);
}));

router.post('/idea/:id', authenticate, validateUUID(), requireFeature('idea_comments'), asyncHandler(async (req: Request, res: Response) => {
  const { body } = req.body ?? {};
  if (!body) {
    res.status(400).json({ error: 'body é obrigatório' });
    return;
  }

  const { rows } = await db.query<Comment>(
    'INSERT INTO comments (idea_id, user_id, body) VALUES ($1, $2, $3) RETURNING *',
    [req.params.id, req.user!.id, sanitizeHtml(body)]
  );
  const comment = rows[0];
  await audit(req.user!.id, 'comment.create', 'comment', comment.id, { idea_id: req.params.id }, req.ip);
  res.status(201).json(comment);
}));

router.delete('/:id', authenticate, validateUUID(), asyncHandler(async (req: Request, res: Response) => {
  const { rows: existingRows } = await db.query<Comment>('SELECT * FROM comments WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (existing.user_id !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  await db.query('DELETE FROM comments WHERE id = $1', [req.params.id]);
  await audit(req.user!.id, 'comment.delete', 'comment', req.params.id, {}, req.ip);
  res.status(204).send();
}));

export default router;
