import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { validateUUID } from '../lib/validateUUID';
import { audit } from '../lib/audit';
import { isFeatureEnabled } from '../lib/featureFlags';
import { asyncHandler } from '../lib/asyncHandler';
import { FeatureFlag } from '../types';

const router = Router();

router.get('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { rows } = await db.query<FeatureFlag>('SELECT * FROM feature_flags ORDER BY key');
  const resolved = await Promise.all(
    rows.map(async (flag) => ({
      key: flag.key,
      enabled: await isFeatureEnabled(flag.key, req.user!.id, req.user!.role),
    }))
  );
  res.json(resolved);
}));

router.get('/admin', authenticate, requireRole('admin'), asyncHandler(async (_req: Request, res: Response) => {
  const { rows } = await db.query<FeatureFlag>('SELECT * FROM feature_flags ORDER BY key');
  res.json(rows);
}));

router.patch('/admin/:id', authenticate, requireRole('admin'), validateUUID(), asyncHandler(async (req: Request, res: Response) => {
  const { enabled, rollout, roles } = req.body ?? {};
  const { rows } = await db.query<FeatureFlag>(
    `UPDATE feature_flags SET
       enabled = COALESCE($1, enabled),
       rollout = COALESCE($2, rollout),
       roles = COALESCE($3, roles)
     WHERE id = $4 RETURNING *`,
    [enabled ?? null, rollout ?? null, roles ?? null, req.params.id]
  );
  if (!rows[0]) {
    res.status(404).json({ error: 'Flag not found' });
    return;
  }
  await audit(req.user!.id, 'feature.toggle', 'feature_flag', req.params.id, { enabled, rollout, roles }, req.ip);
  res.json(rows[0]);
}));

export default router;
