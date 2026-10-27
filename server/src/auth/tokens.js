import jwt from 'jsonwebtoken';

export const AUTH_COOKIE = 'cb_token';

export function signToken(userId, config) {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    algorithm: 'HS256',
  });
}

// Returns the user id, or null if the token is missing/invalid/expired.
export function verifyToken(token, config) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function cookieOptions(config) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

// Minimal cookie header parser for the Socket.IO handshake.
export function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}
