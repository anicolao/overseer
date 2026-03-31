import express from 'express';
import { Dispatcher } from './core/dispatcher';

const app = express();
app.use(express.json());

const dispatcher = new Dispatcher();

// Example handler to complement the routing
dispatcher.register('ping', async (payload: any) => {
  console.log('Received ping event');
});

// Full original Express webhook logic preserved
app.post('/webhook', async (req, res) => {
  try {
    const event = req.headers['x-github-event'] as string;
    const payload = req.body;
    
    if (event) {
      await dispatcher.dispatch(event, payload);
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

export default app;