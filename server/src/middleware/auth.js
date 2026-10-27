import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { AUTH_COOKIE, verifyToken } from '../auth/tokens.js';
import { unauthorized } from '../utils/errors.js';

export function requireAuth(config) {
  return async (req, _res, next) => {
    const userId = verifyToken(req.cookies?.[AUTH_COOKIE], config);
    if (!userId || !mongoose.isValidObjectId(userId)) return next(unauthorized());
    const user = await User.findById(userId);
    if (!user) return next(unauthorized());
    req.user = user;
    next();
  };
}

// Defence in depth against CSRF on top of SameSite=Lax cookies: reject
// state-changing requests whose Origin is not one of ours.
export function checkOrigin(config) {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    const sameHost = (() => {
      try {
        return new URL(origin).host === req.get('host');
      } catch {
        return false;
      }
    })();
    if (sameHost || config.clientOrigins.includes(origin)) return next();
    next(Object.assign(new Error('Origin not allowed.'), { status: 403 }));
  };
}
