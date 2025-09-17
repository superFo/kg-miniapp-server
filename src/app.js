import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { router as searchRouter } from './routes/search.js';
import { router as patentRouter } from './routes/patent.js';
import { router as graphRouter } from './routes/graph.js';
import { router as statsRouter } from './routes/stats.js';
import { router as userRouter } from './routes/user.js';

const app = express();

app.use(cors({ origin: '*'}));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api', searchRouter);
app.use('/api', patentRouter);
app.use('/api', graphRouter);
app.use('/api', statsRouter);
app.use('/api', userRouter);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});


