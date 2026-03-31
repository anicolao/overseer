import express, { Request, Response } from 'express';
import { handleDispatch } from './dispatch';
import crypto from 'crypto';

const app = express();
const port = process.env.PORT || 3000;

// Capture raw body for webhook signature verification
app.use(express.json({
  verify: (req: any, res: any, buf: Buffer) => {
    req.rawBody = buf;
  }
}));

export function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature) return false;
  const expectedSignature = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch (e) {
    return false;
  }
}

app.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const secret = process.env.GITHUB_WEBHOOK_SECRET || 'default_secret';
  
  const rawBody = (req as any).rawBody ? (req as any).rawBody.toString() : JSON.stringify(req.body);

  if (!verifySignature(rawBody, signature, secret)) {
    return res.status(401).send('Invalid signature');
  }

  const event = req.headers['x-github-event'] as string;
  const payload = req.body;

  try {
    await handleDispatch(event, payload);
    res.status(200).send('Event dispatched');
  } catch (error) {
    console.error('Error dispatching event:', error);
    res.status(500).send('Internal Server Error');
  }
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

export default app;