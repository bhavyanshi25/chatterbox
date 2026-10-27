import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { createServer } from '../src/server.js';

// Tests run against a real MongoDB. Each test file gets its own throwaway
// database, dropped at the end. Override the server with TEST_MONGODB_URI
// (no database name), e.g. mongodb://127.0.0.1:27017
const MONGO_BASE = (process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017').replace(/\/+$/, '');

export const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAAABJRU5ErkJggg==',
  'base64'
);

export function testConfig(overrides = {}) {
  return {
    nodeEnv: 'test',
    isProduction: false,
    isTest: true,
    port: 0,
    mongoUri: `${MONGO_BASE}/chatterbox_test_${process.pid}_${Date.now()}`,
    jwtSecret: 'test-secret-that-is-definitely-longer-than-32-characters',
    jwtExpiresIn: '1h',
    clientOrigins: ['http://localhost:5173'],
    uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'chatterbox-test-uploads-')),
    maxUploadBytes: 1024 * 1024,
    serveClient: false,
    clientDist: '',
    ...overrides,
  };
}

export async function startServer(config = testConfig()) {
  const server = await createServer(config);
  await new Promise((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = server.httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const sockets = [];

  return {
    ...server,
    config,
    baseUrl,
    sockets,
    // `keepData` leaves the database in place (used to test restarts).
    async stop({ keepData = false } = {}) {
      sockets.forEach((s) => s.disconnect());
      if (!keepData) {
        await mongoose.connection.dropDatabase();
        fs.rmSync(config.uploadDir, { recursive: true, force: true });
      }
      await server.close();
    },
  };
}

let counter = 0;

// Registers a user through the real API and returns an authenticated agent.
export async function createUser(server, name = 'User') {
  counter += 1;
  const agent = request.agent(server.httpServer);
  const email = `${name.toLowerCase().replace(/\W+/g, '')}${counter}_${Date.now()}@example.com`;
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'correct-horse-9' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
  return { agent, user: res.body.user, email, password: 'correct-horse-9', cookie };
}

export function connectSocket(server, cookie) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(server.baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: cookie ? { Cookie: cookie } : {},
    });
    server.sockets.push(socket);
    const timer = setTimeout(() => reject(new Error('socket ready timeout')), 5000);
    socket.once('ready', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Resolves with the first `event` payload matching `predicate`.
export function waitForEvent(socket, event, predicate = () => true, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for "${event}"`));
    }, timeout);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

// Collects every `event` payload for `ms` milliseconds.
export function collectEvents(socket, event, ms = 400) {
  const seen = [];
  const handler = (p) => seen.push(p);
  socket.on(event, handler);
  return new Promise((resolve) =>
    setTimeout(() => {
      socket.off(event, handler);
      resolve(seen);
    }, ms)
  );
}

export const emitWithAck = (socket, event, payload) =>
  socket.timeout(3000).emitWithAck(event, payload);

export async function directConversation(a, b) {
  const res = await a.agent.post('/api/conversations/direct').send({ userId: b.user.id });
  if (res.status >= 300) throw new Error(`direct failed ${res.status}`);
  return res.body.conversation;
}
