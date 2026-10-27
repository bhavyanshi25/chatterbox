import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
    // Everything sent by others after this point counts as unread for this member.
    lastReadAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['direct', 'group'], required: true },
    name: { type: String, trim: true, maxlength: 80, default: '' },
    members: { type: [memberSchema], default: [] },
    // Sorted "<userA>:<userB>" — guarantees one direct conversation per pair.
    directKey: { type: String, default: undefined },
    pinnedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true }
);

conversationSchema.index({ 'members.user': 1, lastMessageAt: -1 });
conversationSchema.index(
  { directKey: 1 },
  { unique: true, partialFilterExpression: { directKey: { $type: 'string' } } }
);

export const Conversation = mongoose.model('Conversation', conversationSchema);
