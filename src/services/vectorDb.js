// In-memory simple vector database optimized for free-tier serverless environments
// Replaces external ChromaDB dependency to prevent ECONNREFUSED on Render

let collection = [];

/**
 * Validates connection to VectorDB and gets/creates the collection.
 */
export async function initializeVectorDb() {
    collection = [];
    console.log('Initialized in-memory vector database.');
    return true;
}

/**
 * Retrieves the global collection reference.
 */
export function getCollection() {
    return collection;
}

/**
 * Inserts chunks & their embeddings into the store.
 * @param {string[]} ids
 * @param {number[][]} embeddings
 * @param {object[]} metadatas
 * @param {string[]} documents
 */
export async function addChunksToDb(ids, embeddings, metadatas, documents) {
    try {
        for (let i = 0; i < ids.length; i++) {
            collection.push({
                id: ids[i],
                embedding: embeddings[i],
                metadata: metadatas[i],
                document: documents[i]
            });
        }
        console.log(`Inserted/Updated ${ids.length} chunks into VectorDB. Total size: ${collection.length}`);
    } catch (error) {
        console.error('Error inserting chunks into VectorDB:', error.message);
        throw error;
    }
}

function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Search the VectorDB for similarity.
 * @param {number[]} queryEmbedding 
 * @param {number} topK 
 */
export async function searchSimilarChunks(queryEmbedding, topK = 5) {
    try {
        if (collection.length === 0) {
            return { documents: [[]], metadatas: [[]], distances: [[]] };
        }

        const scored = collection.map(item => ({
            ...item,
            score: cosineSimilarity(queryEmbedding, item.embedding)
        }));

        scored.sort((a, b) => b.score - a.score); // Descending score
        const top = scored.slice(0, topK);

        // Format to match old ChromaDB return shape
        return {
            documents: [top.map(i => i.document)],
            metadatas: [top.map(i => i.metadata)],
            distances: [top.map(i => i.score)]
        };
    } catch (error) {
        console.error('Error querying VectorDB:', error.message);
        throw error;
    }
}
