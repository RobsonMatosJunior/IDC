import { Router, Request, Response } from 'express';
import sanitizeHtml from 'sanitize-html';
import { db } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { validateUUID } from '../lib/validateUUID';
import { uniqueSlug } from '../lib/slugify';
import { audit } from '../lib/audit';
import { asyncHandler } from '../lib/asyncHandler';
import { Idea, IdeaType } from '../types';

const router = Router();
const IDEA_TYPES: ReadonlySet<string> = new Set<IdeaType>(['game', 'story']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.query;
  const conditions = ["status = 'published'"];
  const params: unknown[] = [];

  if (typeof type === 'string') {
    if (!IDEA_TYPES.has(type)) {
      res.status(400).json({ error: 'Invalid type' });
      return;
    }
    params.push(type);
    conditions.push(`type = $${params.length}`);
  }

  const { rows } = await db.query<Idea>(
    `SELECT * FROM ideas WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
    params
  );
  res.json(rows);
}));

router.get('/mine', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { rows } = await db.query<Idea>(
    'SELECT * FROM ideas WHERE author_id = $1 ORDER BY created_at DESC',
    [req.user!.id]
  );
  res.json(rows);
}));

router.get('/:idOrSlug', asyncHandler(async (req: Request, res: Response) => {
  const { idOrSlug } = req.params;
  const field = UUID_RE.test(idOrSlug) ? 'id' : 'slug';
  const { rows } = await db.query<Idea>(`SELECT * FROM ideas WHERE ${field} = $1`, [idOrSlug]);
  if (!rows[0]) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(rows[0]);
}));

router.post('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { type, title, summary, content } = req.body ?? {};
  if (!IDEA_TYPES.has(type) || !title || !content) {
    res.status(400).json({ error: 'type, title e content são obrigatórios' });
    return;
  }

  const slug = await uniqueSlug(title);
  const cleanContent = sanitizeHtml(content);
  const { rows } = await db.query<Idea>(
    `INSERT INTO ideas (slug, type, title, summary, content, author_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [slug, type, title, summary ?? null, cleanContent, req.user!.id]
  );
  const idea = rows[0];
  await audit(req.user!.id, 'idea.create', 'idea', idea.id, { type, title }, req.ip);
  res.status(201).json(idea);
}));

router.patch('/:id', authenticate, validateUUID(), asyncHandler(async (req: Request, res: Response) => {
  const { rows: existingRows } = await db.query<Idea>('SELECT * FROM ideas WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (existing.author_id !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { title, summary, content, status } = req.body ?? {};
  if (status && status !== 'draft' && status !== 'published') {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const cleanContent = content ? sanitizeHtml(content) : null;
  const { rows } = await db.query<Idea>(
    `UPDATE ideas SET
       title = COALESCE($1, title),
       summary = COALESCE($2, summary),
       content = COALESCE($3, content),
       status = COALESCE($4, status)
     WHERE id = $5 RETURNING *`,
    [title ?? null, summary ?? null, cleanContent, status ?? null, req.params.id]
  );
  await audit(req.user!.id, status === 'published' ? 'idea.publish' : 'idea.update', 'idea', req.params.id, {}, req.ip);
  res.json(rows[0]);
}));

router.delete('/:id', authenticate, validateUUID(), asyncHandler(async (req: Request, res: Response) => {
  const { rows: existingRows } = await db.query<Idea>('SELECT * FROM ideas WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (existing.author_id !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  await db.query('DELETE FROM ideas WHERE id = $1', [req.params.id]);
  await audit(req.user!.id, 'idea.delete', 'idea', req.params.id, {}, req.ip);
  res.status(204).send();
}));

export default router;
