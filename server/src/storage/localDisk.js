import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const KEY_PATTERN = /^[a-f0-9]{32}\.(jpg|png|gif|webp)$/;

// Stores uploads as files in a private directory (never served statically).
// Swap this module for an S3/GCS implementation with the same interface to
// run multiple server instances.
export function createLocalDiskStorage(rootDir) {
  const resolveKey = (key) => {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    return path.join(rootDir, key);
  };

  return {
    async save(buffer, extension) {
      await fsp.mkdir(rootDir, { recursive: true });
      const key = `${crypto.randomBytes(16).toString('hex')}.${extension}`;
      await fsp.writeFile(resolveKey(key), buffer, { flag: 'wx' });
      return key;
    },

    createReadStream(key) {
      return fs.createReadStream(resolveKey(key));
    },

    async exists(key) {
      try {
        await fsp.access(resolveKey(key));
        return true;
      } catch {
        return false;
      }
    },

    async remove(key) {
      await fsp.rm(resolveKey(key), { force: true });
    },
  };
}
