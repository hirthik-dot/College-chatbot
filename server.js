import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initializeVectorDb } from './src/services/vectorDb.js';
import { runIndexer } from './src/services/indexer.js';
import chatRouter from './src/routes/chat.js';
import reindexRouter from './src/routes/reindex.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/chat', chatRouter);
app.use('/reindex', reindexRouter);

// Basic health check route
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Chatbot backend is running.' });
});

// Startup logic
async function startServer() {
  try {
    console.log('Starting server initialization...');
    
    // 1. Initialize Vector Database connection / collection
    await initializeVectorDb();
    
    // 2. Automatically run indexer on startup to sync JSON files
    // This is crucial for serverless/free-tier hosting where local storage wipes
    console.log('Running automatic indexing of local JSON files...');
    await runIndexer();

    // 3. Start listening for requests
    app.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
