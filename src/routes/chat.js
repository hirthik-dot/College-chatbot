import express from 'express';
import { getEmbeddings } from '../services/embedding.js';
import { searchSimilarChunks } from '../services/vectorDb.js';
import { fetchLlmResponse } from '../services/llm.js';

const router = express.Router();

const SYSTEM_PROMPT = `You are an official college assistant.
Answer ONLY using the provided context.
If the answer is not present in the context, say you do not have that information.
Be concise and helpful.`;

router.post('/', async (req, res) => {
    try {
        const { question } = req.body;

        if (!question || typeof question !== 'string') {
            return res.status(400).json({ error: 'Valid string "question" field is required in request body.' });
        }

        console.log(`Received question: "${question}"`);

        // 1. Embed the user's question
        const questionEmbeddingResult = await getEmbeddings([question]);

        // Validating HF output format
        const questionEmbedding = Array.isArray(questionEmbeddingResult[0])
            ? questionEmbeddingResult[0]
            : questionEmbeddingResult;

        // 2. Retrieve top 5 relevant chunks from Vector DB
        const searchResults = await searchSimilarChunks(questionEmbedding, 5);

        // Extract documents and metadata from the result
        const chunksText = searchResults.documents[0] || [];
        const chunksMeta = searchResults.metadatas[0] || [];

        if (chunksText.length === 0) {
            return res.json({
                answer: "I don't have enough information to answer that.",
                sources: []
            });
        }

        // 3. Build prompt
        const contextStr = chunksText.join('\n\n');
        let userMessage = `Context:\n${contextStr}\n\nQuestion:\n${question}`;

        // Limit length just in case
        if (userMessage.length > 8000) {
            userMessage = userMessage.substring(0, 8000) + '...';
        }

        // 4. Send to OpenRouter model
        const llmAnswer = await fetchLlmResponse(SYSTEM_PROMPT, userMessage);

        // 5. Build dynamic sources list
        const sourcesSet = new Set();
        chunksMeta.forEach(meta => {
            if (meta && meta.source) {
                sourcesSet.add(meta.source);
            }
        });

        const sourcesArray = Array.from(sourcesSet);

        return res.json({
            answer: llmAnswer,
            sources: sourcesArray
        });

    } catch (error) {
        console.error('Error in /chat route:', error);
        return res.status(500).json({
            error: 'An internal server error occurred while processing your chat request.',
            details: error.message,
            stack: error.stack
        });
    }
});

export default router;
