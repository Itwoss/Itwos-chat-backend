import { describe, it, expect } from 'vitest';
import Message, { MESSAGE_TYPE_VALUES } from '../models/Message.js';

describe('Message model', () => {
  it('includes post_share in messageType (schema + export)', () => {
    expect(MESSAGE_TYPE_VALUES).toContain('post_share');
    const ev = Message.schema.path('messageType').enumValues;
    expect(ev).toContain('post_share');
  });
});
