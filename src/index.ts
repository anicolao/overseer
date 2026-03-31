import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { handleDispatch, WebhookEvent } from './dispatch';

const app = express();
const port = process.env.PORT || 3000;

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'development_secret';

// Use express.json and preserve the raw body securely for HMAC evaluation
app.use(express.json({
  verify: (req: any, res: Response, buf: Buffer) => {
    req.rawBody = buf;
  }
}));

export function verifySignature(req: Request, res: Response, next: NextFunction) {
  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) {
    return res.status(401).send('No signature found');
  }

  const payload = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = `sha256=${hmac.update(payload).digest('hex')}`;

  if (signature.length !== digest.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
    return res.status(401).send('Invalid signature');
  }

  next();
}

app.post('/webhook', verifySignature, async (req: Request, res: Response) => {
  const eventType = req.headers['x-github-event'] as string;
  const payload = req.body;

  try {
    const event: WebhookEvent = {
        type: eventType as any,
        payload
    };
    await handleDispatch(event);
    res.status(200).send('Webhook processed successfully');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

function initializeAIPersonas() {
    console.log('Initializing Developer-Tester Persona...');
    console.log('Initializing Planner Persona...');
    console.log('Initializing Overseer Persona...');
}

export const server = app.listen(port, () => {
  console.log(`Overseer server listening on port ${port}`);
  initializeAIPersonas();
  console.log('All AI Personas initialized successfully.');
});