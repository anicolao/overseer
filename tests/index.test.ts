import request from 'supertest';
import crypto from 'crypto';
import { server } from '../src/index';

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'development_secret';

describe('Webhook Express Server & Security', () => {
  afterAll((done) => {
    server.close(done);
  });

  it('should return 401 if x-hub-signature-256 is entirely missing', async () => {
    const res = await request(server).post('/webhook').send({});
    expect(res.status).toBe(401);
    expect(res.text).toBe('No signature found');
  });

  it('should return 401 if the provided signature is invalid', async () => {
    const res = await request(server)
      .post('/webhook')
      .set('x-hub-signature-256', 'sha256=invalid_signature_length_matching_the_hash_so_it_fails_properly000000')
      .send({});
    expect(res.status).toBe(401);
    expect(res.text).toBe('Invalid signature');
  });

  it('should return 200 and process webhook cleanly if the signature is valid', async () => {
    const payload = { test: 'payload' };
    const payloadString = JSON.stringify(payload);
    
    // Mock the hmac locally to match the server side
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    const digest = `sha256=${hmac.update(payloadString).digest('hex')}`;

    const res = await request(server)
      .post('/webhook')
      .set('x-hub-signature-256', digest)
      .set('x-github-event', 'issues')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.text).toBe('Webhook processed successfully');
  });
});