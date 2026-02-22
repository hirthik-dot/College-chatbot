import { ChromaClient } from 'chromadb';

const client = new ChromaClient();
const COLLECTION_NAME = 'college_data_collection';
let collection = null;

/**
 * Validates connection to VectorDB and gets/creates the collection.
 */
export async function initializeVectorDb() {
    try {
        // Check if collection exists
        collection = await client.getOrCreateCollection({
            name: COLLECTION_NAME,
        });
        console.log(`VectorDB initialized. Collection: ${COLLECTION_NAME}`);
    } catch (error) {
        console.error('Failed to initialize VectorDB Chroma:', error.message);
        throw error;
    }
}

/**
 * Retrieves the global collection reference.
 */
export function getCollection() {
    if (!collection) {
        throw new Error('Collection not initialized. Call initializeVectorDb first.');
    }
    return collection;
}

/**
 * Inserts chunks & their embeddings into ChromaDB.
 * @param {string[]} ids
 * @param {number[][]} embeddings
 * @param {object[]} metadatas
 * @param {string[]} documents
 */
export async function addChunksToDb(ids, embeddings, metadatas, documents) {
    const col = getCollection();
    try {
        await col.upsert({
            ids: ids,
            embeddings: embeddings,
            metadatas: metadatas,
            documents: documents,
        });
        console.log(`Inserted/Updated ${ids.length} chunks into VectorDB.`);
    } catch (error) {
        console.error('Error inserting chunks into VectorDB:', error.message);
        throw error;
    }
}

/**
 * Search the VectorDB for similarity.
 * @param {number[]} queryEmbedding 
 * @param {number} topK 
 */
export async function searchSimilarChunks(queryEmbedding, topK = 5) {
    const col = getCollection();
    try {
        const results = await col.query({
            queryEmbeddings: [queryEmbedding], // We send a batch of 1
            nResults: topK,
        });
        return results;
    } catch (error) {
        console.error('Error querying VectorDB:', error.message);
        throw error;
    }
}
