import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { conversationsRouter } from './routes/conversations.js';
import { messagesRouter } from './routes/messages.js';
import { attachmentsRouter } from './routes/attachments.js';
import { checkOrigin, requireAuth } from './middleware/auth.js';
import { notFound } from './utils/errors.js';

export function createApp({ config, realtime, storage }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProduction) app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-origin' },
      contentSecurityPolicy: {
        directives: { imgSrc: ["'self'", 'data:', 'https:', 'http:'] },
      },
    })
  );
  app.use(cors({ origin: config.clientOrigins, credentials: true }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use('/api', checkOrigin(config));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter(config, realtime));

  const auth = requireAuth(config);
  app.use('/api/users', auth, usersRouter(realtime));
  app.use('/api/conversations', auth, conversationsRouter(realtime));
  app.use('/api/messages', auth, messagesRouter(realtime, storage));
  app.use('/api', auth, attachmentsRouter(config, storage));

  app.use('/api', (_req, _res, next) => next(notFound('API route not found.')));

  // Optional: serve the built frontend from the same origin (npm run build first).
  if (config.serveClient && fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false }));
    app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) =>
      res.sendFile(path.join(config.clientDist, 'index.html'))
    );
  }

  app.use((err, _req, res, _next) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message || 'Invalid request.' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must be valid JSON.' });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }
    const status = err?.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({
      error: status >= 500 ? 'Something went wrong on our side.' : err.message,
      ...(err?.details ? { details: err.details } : {}),
    });
  });

  return app;
}
