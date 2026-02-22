import 'dotenv/config';

// The model we want to use for generating embeddings
const MODEL_NAME = 'sentence-transformers/all-MiniLM-L6-v2';
const HF_URL = `https://router.huggingface.co/hf-inference/pipeline/feature-extraction/${MODEL_NAME}`;

/**
 * Generate embeddings for a list of texts using HuggingFace Inference API via native fetch.
 * This circumvents the deprecated URL issue in older SDK versions.
 * @param {string[]} texts - Array of strings to embed.
 * @returns {Promise<number[][]>} - Array of embeddings (arrays of numbers).
 */
export async function getEmbeddings(texts) {
    if (!process.env.HUGGINGFACE_API_KEY) {
        throw new Error('HF Inference client not initialized. Check your HUGGINGFACE_API_KEY.');
    }

    try {
        const response = await fetch(HF_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: texts,
                options: { wait_for_model: true }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HuggingFace API error (${response.status}): ${errorText}`);
        }

        const output = await response.json();

        // The HF text-embedding model returns the embedding directly or inside a nested structure
        return output;
    } catch (error) {
        console.error('Failed to generate embeddings via HuggingFace fetch:', error.message);
        throw error;
    }
}
