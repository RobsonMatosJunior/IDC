import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { AuditLog } from '../types';

const router = Router();

router.get('/', authenticate, requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { from, to, action } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (typeof action === 'string') {
    params.push(action);
    conditions.push(`action = $${params.length}`);
  }
  if (typeof from === 'string') {
    params.push(from);
    conditions.push(`created_at >= $${params.length}`);
  }
  if (typeof to === 'string') {
    params.push(to);
    conditions.push(`created_at <= $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await db.query<AuditLog>(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT 200`,
    params
  );
  res.json(rows);
}));

export default router;
