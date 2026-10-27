import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// Metadata for an uploaded file. The bytes live in the storage backend
// (see storage/localDisk.js) under `storageKey`.
const attachmentSchema = new mongoose.Schema(
  {
    conversation: { type: ObjectId, ref: 'Conversation', required: true },
    uploader: { type: ObjectId, ref: 'User', required: true },
    message: { type: ObjectId, ref: 'Message', default: null },
    storageKey: { type: String, required: true },
    originalName: { type: String, default: 'image', maxlength: 200 },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: true }
);

attachmentSchema.index({ message: 1, createdAt: 1 });

export const Attachment = mongoose.model('Attachment', attachmentSchema);
