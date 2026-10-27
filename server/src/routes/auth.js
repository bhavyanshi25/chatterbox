import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/User.js';
import { AUTH_COOKIE, cookieOptions, signToken } from '../auth/tokens.js';
import { requireAuth } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { conflict, unauthorized } from '../utils/errors.js';
import { serializeUser } from '../services/serialize.js';

const BCRYPT_ROUNDS = 12;

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(60, 'Name is too long.'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password is too long.'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z.string().min(1, 'Password is required.').max(128),
});

// A real hash of a random string — comparing against it when the email is
// unknown keeps login timing the same for existing and missing accounts.
const DUMMY_HASH = bcrypt.hashSync('chatterbox-timing-equaliser', BCRYPT_ROUNDS);

export function authRouter(config, realtime) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.isTest ? 1000 : 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
  });

  const startSession = (res, user) => {
    res.cookie(AUTH_COOKIE, signToken(user._id, config), cookieOptions(config));
    return { user: serializeUser(user, realtime, { includeEmail: true }) };
  };

  router.post('/register', limiter, async (req, res) => {
    const { name, email, password } = parse(registerSchema, req.body);
    if (await User.exists({ email })) throw conflict('An account with this email already exists.');
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    let user;
    try {
      user = await User.create({
        name,
        email,
        passwordHash,
        avatar: `https://i.pravatar.cc/150?u=${encodeURIComponent(email)}`,
      });
    } catch (err) {
      if (err?.code === 11000) throw conflict('An account with this email already exists.');
      throw err;
    }
    res.status(201).json(startSession(res, user));
  });

  router.post('/login', limiter, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await User.findOne({ email }).select('+passwordHash');
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw unauthorized('Invalid email or password.');
    res.json(startSession(res, user));
  });

  router.post('/logout', (_req, res) => {
    const { maxAge: _maxAge, ...opts } = cookieOptions(config);
    res.clearCookie(AUTH_COOKIE, opts);
    res.status(204).end();
  });

  router.get('/me', requireAuth(config), (req, res) => {
    res.json({ user: serializeUser(req.user, realtime, { includeEmail: true }) });
  });

  return router;
}
