import { describe, it, expect } from 'vitest';
import { normalizeEndpointUrl, endpointUrlWasCompleted, endpointSendsInTheClear } from './endpointUrl';

describe('normalizeEndpointUrl', () => {
  it('completes a bare origin — the LM Studio "Reachable at" paste', () => {
    expect(normalizeEndpointUrl('http://127.0.0.1:1234')).toBe('http://127.0.0.1:1234/v1/chat/completions');
    expect(normalizeEndpointUrl('http://localhost:11434/')).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('completes a bare /v1 — the OpenAI-SDK base-URL convention', () => {
    expect(normalizeEndpointUrl('http://localhost:1234/v1')).toBe('http://localhost:1234/v1/chat/completions');
    expect(normalizeEndpointUrl('https://api.featherless.ai/v1/')).toBe('https://api.featherless.ai/v1/chat/completions');
  });

  it('leaves an already-complete URL untouched', () => {
    const full = 'https://api.lyonade.net/v1/chat/completions';
    expect(normalizeEndpointUrl(full)).toBe(full);
  });

  it('leaves non-standard paths alone rather than guessing', () => {
    for (const url of [
      'https://gateway.example.com/openai',
      'https://example.com/api/v1',
      'https://example.com/v2',
      'https://example.com/v1/responses',
    ]) {
      expect(normalizeEndpointUrl(url)).toBe(url);
    }
  });

  it('trims whitespace from a paste', () => {
    expect(normalizeEndpointUrl('  http://127.0.0.1:1234  ')).toBe('http://127.0.0.1:1234/v1/chat/completions');
  });

  it('preserves a query string when completing', () => {
    expect(normalizeEndpointUrl('https://example.com/v1?key=abc')).toBe('https://example.com/v1/chat/completions?key=abc');
  });

  it('returns unparseable or non-http input as-is', () => {
    expect(normalizeEndpointUrl('')).toBe('');
    expect(normalizeEndpointUrl('   ')).toBe('');
    expect(normalizeEndpointUrl('127.0.0.1:1234')).toBe('127.0.0.1:1234');
    expect(normalizeEndpointUrl('not a url')).toBe('not a url');
    expect(normalizeEndpointUrl('file:///tmp/x')).toBe('file:///tmp/x');
  });
});

describe('default-endpoint equivalence', () => {
  // The legacy-migration and custom-endpoint-toggle checks compare a stashed endpoint against the shipped
  // default through this function; a legacy install stashed the full URL, the default is now the base URL.
  it('treats the base URL and its full form as the same endpoint', () => {
    expect(normalizeEndpointUrl('https://api.lyonade.net/v1'))
      .toBe(normalizeEndpointUrl('https://api.lyonade.net/v1/chat/completions'));
  });
});

describe('endpointUrlWasCompleted', () => {
  it('is true only when we filled something in', () => {
    expect(endpointUrlWasCompleted('http://127.0.0.1:1234')).toBe(true);
    expect(endpointUrlWasCompleted('http://127.0.0.1:1234/v1')).toBe(true);
    expect(endpointUrlWasCompleted('http://127.0.0.1:1234/v1/chat/completions')).toBe(false);
    expect(endpointUrlWasCompleted('https://gateway.example.com/openai')).toBe(false);
    expect(endpointUrlWasCompleted('')).toBe(false);
    expect(endpointUrlWasCompleted('  http://127.0.0.1:1234/v1/chat/completions  ')).toBe(false);
  });
});

describe('endpointSendsInTheClear', () => {
  it('flags plain HTTP to a host out on the internet', () => {
    for (const url of [
      'http://203.0.113.9:5001',
      'http://pod-5001.proxy.runpod.net/v1',
      'http://api.example.com/v1/chat/completions',
      'http://8.8.8.8:8000',
    ]) {
      expect(endpointSendsInTheClear(url)).toBe(true);
    }
  });

  it('stays quiet for HTTPS anywhere', () => {
    expect(endpointSendsInTheClear('https://api.lyonade.net/v1')).toBe(false);
    expect(endpointSendsInTheClear('https://203.0.113.9:5001')).toBe(false);
  });

  it('stays quiet for a link the player controls', () => {
    for (const url of [
      'http://localhost:1234',
      'http://127.0.0.1:5001/v1',
      'http://[::1]:8080',
      'http://192.168.1.40:5001',
      'http://10.0.0.7:8000',
      'http://172.16.4.2:8000',
      'http://172.31.255.1:8000',
      'http://169.254.10.3:8000',
      'http://[fe80::1]:8000',
      'http://[fd00::1]:8000',
      'http://workstation.local:1234',
    ]) {
      expect(endpointSendsInTheClear(url)).toBe(false);
    }
  });

  it('stays quiet inside the Tailscale range, which is encrypted under the http://', () => {
    expect(endpointSendsInTheClear('http://100.64.0.1:5001')).toBe(false);
    expect(endpointSendsInTheClear('http://100.101.102.103:5001')).toBe(false);
    expect(endpointSendsInTheClear('http://100.127.255.254:5001')).toBe(false);
  });

  it('does not mistake a neighbouring range for a private one', () => {
    // 172.15/172.32 sit outside RFC1918, and 100.63/100.128 outside the CGNAT block.
    expect(endpointSendsInTheClear('http://172.15.0.1:8000')).toBe(true);
    expect(endpointSendsInTheClear('http://172.32.0.1:8000')).toBe(true);
    expect(endpointSendsInTheClear('http://100.63.0.1:8000')).toBe(true);
    expect(endpointSendsInTheClear('http://100.128.0.1:8000')).toBe(true);
    // A public host that merely ends in something private-looking.
    expect(endpointSendsInTheClear('http://notlocalhost.com/v1')).toBe(true);
  });

  it('says nothing about a URL still being typed', () => {
    expect(endpointSendsInTheClear('')).toBe(false);
    expect(endpointSendsInTheClear('   ')).toBe(false);
    expect(endpointSendsInTheClear('http:/')).toBe(false);
    expect(endpointSendsInTheClear('api.example.com')).toBe(false);
  });
});
