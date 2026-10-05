import { describe, it, expect } from 'vitest';
import { authoringServerNote } from './authoringRequest';
import { AiStreamError } from './aiRequest/aiStream';

describe('authoringServerNote', () => {
  it("quotes the server's own message", () => {
    const error = new AiStreamError('http', 'HTTP 400', { status: 400, serverError: { message: 'max_tokens is too large' } });
    expect(authoringServerNote(error)).toBe('The server said: max_tokens is too large');
  });

  it('adds nothing when the server sent no message', () => {
    expect(authoringServerNote(new AiStreamError('http', 'HTTP 500', { status: 500 }))).toBeUndefined();
    expect(authoringServerNote(new AiStreamError('http', 'HTTP 400', { serverError: { message: '  ' } }))).toBeUndefined();
  });

  it('adds nothing for an error that is not a failed request', () => {
    expect(authoringServerNote(new Error('The model sent an empty answer'))).toBeUndefined();
  });
});
