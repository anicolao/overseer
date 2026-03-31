import request from 'supertest';
import app, { verifySignature } from '../src/index';
import crypto from 'crypto';

describe('Express Server Webhook', () => {
  const secret = 'test_secret';

  beforeAll(() => {
    process.env.GITHUB_WEBHOOK_SECRET = secret;
  });

  it('should return 401 for invalid signature', async () => {
    const response = await request(app)
      .post('/webhook')
      .send({ action: 'opened' })
      .set('x-github-event', 'issues')
      .set('x-hub-signature-256', 'sha256=invalid');

    expect(response.status).toBe(401);
  });

  it('should return 200 for valid signature', async () => {
    const payload = JSON.stringify({ action: 'opened' });
    const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .send(payload)
      .set('x-github-event', 'issues')
      .set('x-hub-signature-256', signature);

    expect(response.status).toBe(200);
  });
});

describe('verifySignature', () => {
  it('validates correct signature', () => {
    const secret = 'secret';
    const payload = 'payload';
    const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifySignature(payload, signature, secret)).toBe(true);
  });

  it('rejects incorrect signature', () => {
    const secret = 'secret';
    const payload = 'payload';
    const signature = 'sha256=wrong';
    expect(verifySignature(payload, signature, secret)).toBe(false);
  });
});