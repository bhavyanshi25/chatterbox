import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getMessageStatus } from './messages.js';

describe('message delivery status', () => {
  const conversation = {
    members: [{ user: { id: 'sender' } }, { user: { id: 'recipient' } }],
  };

  it('shows a single tick while a message is only sent', () => {
    assert.equal(
      getMessageStatus({ senderId: 'sender', deliveredTo: [], readBy: [] }, conversation, 'sender'),
      'sent'
    );
  });

  it('shows double ticks after delivery', () => {
    assert.equal(
      getMessageStatus(
        { senderId: 'sender', deliveredTo: ['recipient'], readBy: [] },
        conversation,
        'sender'
      ),
      'delivered'
    );
  });

  it('shows the read state after all recipients have read', () => {
    assert.equal(
      getMessageStatus(
        { senderId: 'sender', deliveredTo: ['recipient'], readBy: ['recipient'] },
        conversation,
        'sender'
      ),
      'read'
    );
  });
});
