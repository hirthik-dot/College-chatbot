import express from 'express';
import { runIndexer } from '../services/indexer.js';

const router = express.Router();

// Allow manual trigger for reindexing the data directory
router.post('/', async (req, res) => {
    try {
        console.log('Manual reindex requested...');
        // We await runIndexer to block the response until the indexing finishes.
        await runIndexer();
        return res.json({ success: true, message: 'Reindexing complete.' });
    } catch (error) {
        console.error('Error in /reindex route:', error);
        return res.status(500).json({ success: false, error: 'Failed to complete reindexing.' });
    }
});

export default router;
