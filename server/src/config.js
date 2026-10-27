import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. See server/.env.example.`);
  }
  return value;
}

// Read lazily so tests can set process.env before the first call.
export function loadConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const jwtSecret = required('JWT_SECRET');
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long.');
  }

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    port: Number(process.env.PORT) || 4000,
    mongoUri: required('MONGODB_URI'),
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    // Comma-separated list of origins allowed to call the API with cookies.
    clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    uploadDir: path.resolve(serverRoot, process.env.UPLOAD_DIR || 'uploads'),
    maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 5) * 1024 * 1024,
    serveClient: process.env.SERVE_CLIENT === 'true',
    clientDist: path.resolve(serverRoot, '..', 'dist'),
  };
}
