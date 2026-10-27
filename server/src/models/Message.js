import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: ObjectId, ref: 'Conversation', required: true },
    sender: { type: ObjectId, ref: 'User', required: true },
    // Client-generated id used to make sends idempotent across retries/reconnects.
    clientId: { type: String, required: true, maxlength: 64 },
    text: { type: String, default: '', maxlength: 4000 },
    attachment: { type: ObjectId, ref: 'Attachment', default: null },
    replyTo: {
      type: new mongoose.Schema(
        {
          messageId: { type: ObjectId, ref: 'Message' },
          senderId: { type: ObjectId, ref: 'User' },
          senderName: String,
          text: String,
        },
        { _id: false }
      ),
      default: null,
    },
    reactions: {
      type: [
        new mongoose.Schema(
          { emoji: { type: String, required: true }, user: { type: ObjectId, ref: 'User', required: true } },
          { _id: false }
        ),
      ],
      default: [],
    },
    deliveredTo: [{ type: ObjectId, ref: 'User' }],
    readBy: [{ type: ObjectId, ref: 'User' }],
    starredBy: [{ type: ObjectId, ref: 'User' }],
    editedAt: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, clientId: 1 }, { unique: true });
messageSchema.index({ starredBy: 1 });

export const Message = mongoose.model('Message', messageSchema);
