import http from 'node:http';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { createRealtime } from './realtime.js';
import { createSocketServer } from './socket.js';
import { createLocalDiskStorage } from './storage/localDisk.js';

// Builds the whole backend (HTTP + Socket.IO) without listening, so tests can
// start it on a random port.
export async function createServer(config) {
  await mongoose.connect(config.mongoUri);
  await mongoose.connection.syncIndexes();

  const realtime = createRealtime();
  const storage = createLocalDiskStorage(config.uploadDir);
  const app = createApp({ config, realtime, storage });
  const httpServer = http.createServer(app);
  const io = createSocketServer(httpServer, config, realtime);

  return {
    app,
    io,
    httpServer,
    storage,
    async close() {
      io.close();
      await new Promise((resolve) => httpServer.close(() => resolve()));
      await mongoose.disconnect();
    },
  };
}
