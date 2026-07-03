import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { asyncHandler } from './asyncHandler';
import { FeatureFlag, FeatureFlagOverride, Role } from '../types';

function hashPercent(userId: string): number {
  const hash = crypto.createHash('md5').update(userId).digest('hex');
  return parseInt(hash.slice(0, 8), 16) % 100;
}

export async function isFeatureEnabled(key: string, userId: string, role: Role): Promise<boolean> {
  const { rows } = await db.query<FeatureFlag>('SELECT * FROM feature_flags WHERE key = $1', [key]);
  const flag = rows[0];
  if (!flag) return false;

  const { rows: overrideRows } = await db.query<FeatureFlagOverride>(
    'SELECT * FROM feature_flag_overrides WHERE flag_id = $1 AND user_id = $2',
    [flag.id, userId]
  );
  if (overrideRows[0]) return overrideRows[0].enabled;

  if (!flag.enabled) return false;
  if (!flag.roles.includes(role)) return false;
  if (flag.rollout < 100) return hashPercent(userId) < flag.rollout;
  return true;
}

export function requireFeature(key: string) {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Missing token' });
      return;
    }
    const enabled = await isFeatureEnabled(key, user.id, user.role);
    if (!enabled) {
      res.status(404).json({ error: 'Feature not available' });
      return;
    }
    next();
  });
}
