import { HfInference } from '@huggingface/inference';
import 'dotenv/config';

// The model we want to use for generating embeddings
// "sentence-transformers/all-MiniLM-L6-v2" generates 384-dimensional embeddings
const MODEL_NAME = 'sentence-transformers/all-MiniLM-L6-v2';

let hf;

if (process.env.HUGGINGFACE_API_KEY) {
    hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
} else {
    console.warn('WARNING: HUGGINGFACE_API_KEY is not set in environment variables.');
}

/**
 * Generate embeddings for a list of texts using HuggingFace Inference API.
 * This is memory efficient because the model runs remotely on HuggingFace servers.
 * @param {string[]} texts - Array of strings to embed.
 * @returns {Promise<number[][]>} - Array of embeddings (arrays of numbers).
 */
export async function getEmbeddings(texts) {
    if (!hf) {
        throw new Error('HF Inference client not initialized. Check your HUGGINGFACE_API_KEY.');
    }

    try {
        const output = await hf.featureExtraction({
            model: MODEL_NAME,
            inputs: texts,
        });

        // The HF text-embedding model returns the embedding directly or inside a nested structure
        // Depending on the API format, for all-MiniLM-L6-v2 it generally returns a list of embeddings.
        return output;
    } catch (error) {
        console.error('Failed to generate embeddings via HuggingFace:', error.message);
        throw error;
    }
}
