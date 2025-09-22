import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { router as searchRouter } from './routes/search.js';
import { router as patentRouter } from './routes/patent.js';
import { router as graphRouter } from './routes/graph.js';
import { router as statsRouter } from './routes/stats.js';
import { router as userRouter } from './routes/user.js';
import { router as advancedRouter } from './routes/advanced.js';
import { router as inventorGraphRouter } from './routes/inventor_graph.js';
import { router as favRouter } from './routes/fav.js';
import { router as noteRouter } from './routes/note.js';
import { router as compareRouter } from './routes/compare.js';
import { router as exportRouter } from './routes/export.js';

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
app.use('/api', advancedRouter);
app.use('/api', inventorGraphRouter);
app.use('/api', favRouter);
app.use('/api', noteRouter);
app.use('/api', compareRouter);
app.use('/api', exportRouter);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});


