import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Attachment } from '../models/Attachment.js';
import { getMemberConversation } from '../services/conversations.js';
import { serializeAttachment } from '../services/serialize.js';
import { ALLOWED_IMAGE_TYPES, detectImageType } from '../utils/imageType.js';
import { badRequest, HttpError, notFound } from '../utils/errors.js';

export function attachmentsRouter(config, storage) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 5 },
  }).single('image');

  const runUpload = (req, res) =>
    new Promise((resolve, reject) => {
      upload(req, res, (err) => {
        if (!err) return resolve();
        if (err.code === 'LIMIT_FILE_SIZE') {
          const mb = config.maxUploadBytes / (1024 * 1024);
          return reject(new HttpError(413, `Images can be at most ${mb} MB.`));
        }
        if (err instanceof multer.MulterError) return reject(badRequest('Invalid upload.'));
        reject(err);
      });
    });

  // Upload an image into a conversation. The returned id is then sent with a
  // message (see `attachmentId`); unsent uploads are cleaned up after an hour.
  router.post('/conversations/:id/attachments', async (req, res) => {
    const conversation = await getMemberConversation(req.params.id, req.user._id);
    await runUpload(req, res);
    if (!req.file) throw badRequest('Choose an image to upload (form field "image").');
    if (!ALLOWED_IMAGE_TYPES.includes(req.file.mimetype)) {
      throw new HttpError(415, 'Only JPG, PNG, GIF or WebP images can be attached.');
    }
    const detected = detectImageType(req.file.buffer);
    if (!detected) throw new HttpError(415, "That file isn't a valid JPG, PNG, GIF or WebP image.");

    const storageKey = await storage.save(req.file.buffer, detected.ext);
    const attachment = await Attachment.create({
      conversation: conversation._id,
      uploader: req.user._id,
      storageKey,
      originalName: (req.file.originalname || `image.${detected.ext}`).slice(0, 200),
      mimeType: detected.mime,
      size: req.file.size,
    });
    res.status(201).json({ attachment: serializeAttachment(attachment) });
  });

  // Streams an image to members of its conversation only.
  router.get('/attachments/:id', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound();
    const attachment = await Attachment.findById(req.params.id);
    if (!attachment) throw notFound();
    await getMemberConversation(attachment.conversation, req.user._id).catch(() => {
      throw notFound();
    });
    // Unsent uploads are visible to their uploader only.
    if (!attachment.message && String(attachment.uploader) !== String(req.user._id)) throw notFound();
    if (!(await storage.exists(attachment.storageKey))) throw notFound();

    // Files never change, but access can (deleted message, removed member), so
    // browsers must revalidate every time; unchanged files cost only a 304.
    const etag = `"${attachment._id}"`;
    res.set({ ETag: etag, 'Cache-Control': 'private, no-cache' });
    if (req.get('if-none-match') === etag) return res.status(304).end();

    res.set({
      'Content-Type': attachment.mimeType,
      'Content-Length': String(attachment.size),
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Content-Security-Policy': "default-src 'none'",
    });
    storage.createReadStream(attachment.storageKey).pipe(res);
  });

  return router;
}

// Deletes uploads that were never attached to a message.
export async function cleanupOrphanAttachments(storage, olderThanMs = 60 * 60 * 1000) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const orphans = await Attachment.find({ message: null, createdAt: { $lt: cutoff } });
  for (const a of orphans) {
    await storage.remove(a.storageKey);
    await Attachment.deleteOne({ _id: a._id });
  }
  return orphans.length;
}
