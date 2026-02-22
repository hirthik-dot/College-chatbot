import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getEmbeddings } from './embedding.js';
import { addChunksToDb, getCollection } from './vectorDb.js';

// The directory containing JSON configuration files
const DATA_DIR = path.resolve('data');

// Simple key-value store to keep track of processed file hashes
// In a true serverless environment, this is kept in memory.
// It will reset on boot, causing all files to be read and index checked against Chroma.
const processedHashes = new Map();

/**
 * Calculates SHA-256 hash of a file's contents.
 */
function getFileHash(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Recursively find all .json files in a directory.
 */
function findJsonFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;

    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            findJsonFiles(filePath, fileList);
        } else if (filePath.endsWith('.json')) {
            fileList.push(filePath);
        }
    }

    return fileList;
}

/**
 * Flattens nested JSON objects into an array of readable text chunks.
 * Also keeps metadata context.
 */
function extractChunksFromJson(filePath) {
    let data;
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        data = JSON.parse(raw);
    } catch (err) {
        console.error(`Error reading or parsing ${filePath}:`, err);
        return [];
    }

    const chunks = [];
    const fileName = path.basename(filePath);

    // A helper function to deeply traverse and extract text blocks
    // For small/simple data structures, we serialize blocks of keys to text
    function traverse(obj, prefix = '') {
        if (Array.isArray(obj)) {
            obj.forEach((item, index) => traverse(item, `${prefix}[${index}]`));
        } else if (typeof obj === 'object' && obj !== null) {
            // Chunking strategy: keep objects of textual data together
            // Limit recursion by stringifying small structures, or deeply traversing large ones.
            const str = JSON.stringify(obj);
            if (str.length < 2000) { // arbitrary threshold for token size constraints (~500 tokens)
                // Format nicely
                const cleanText = Object.entries(obj)
                    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                    .join('. ');

                chunks.push({
                    text: `[File: ${fileName}] Context: ${prefix ? prefix + ' -> ' : ''}${cleanText}`,
                    metadata: { source: fileName, path: filePath, section: prefix }
                });
            } else {
                // Too big, go deeper
                for (const [key, value] of Object.entries(obj)) {
                    traverse(value, prefix ? `${prefix}.${key}` : key);
                }
            }
        } else {
            // Primitive
            chunks.push({
                text: `[File: ${fileName}] ${prefix}: ${obj}`,
                metadata: { source: fileName, path: filePath, section: prefix }
            });
        }
    }

    // If the top level is an object or array, traverse
    if (typeof data === 'object') {
        traverse(data);
    } else {
        chunks.push({
            text: String(data),
            metadata: { source: fileName, path: filePath }
        });
    }

    return chunks;
}

/**
 * Main routine: scans data dir, hashes, un-chunks, embeds, and saves to Chroma.
 */
export async function runIndexer() {
    console.log('Starting indexer routine...');

    if (!fs.existsSync(DATA_DIR)) {
        console.log(`Creating missing data directory at: ${DATA_DIR}`);
        fs.mkdirSync(DATA_DIR, { recursive: true });
        return;
    }

    const jsonFiles = findJsonFiles(DATA_DIR);
    if (jsonFiles.length === 0) {
        console.log('No JSON files found to index.');
        return;
    }

    let totalUpserted = 0;

    for (const file of jsonFiles) {
        const currentHash = getFileHash(file);
        const previousHash = processedHashes.get(file);

        // Skip if unchanged
        if (previousHash === currentHash) {
            continue;
        }

        console.log(`Processing updated/new file: ${file}`);
        const chunkData = extractChunksFromJson(file);

        // Group into batches to avoid exceeding HF Inference limits
        const BATCH_SIZE = 10;
        for (let i = 0; i < chunkData.length; i += BATCH_SIZE) {
            const batch = chunkData.slice(i, i + BATCH_SIZE);
            const texts = batch.map(c => c.text);
            if (texts.length === 0) continue;

            try {
                const embeddings = await getEmbeddings(texts);

                // Ensure embeddings format is array of arrays
                const validEmbeddings = Array.isArray(embeddings[0]) ? embeddings : [embeddings];

                const ids = batch.map((_, idx) => `id_${crypto.randomUUID()}`);
                const metadatas = batch.map(c => c.metadata);

                await addChunksToDb(ids, validEmbeddings, metadatas, texts);
                totalUpserted += texts.length;
            } catch (err) {
                console.error(`Failed to process batch in file ${file}:`, err);
            }
        }

        // Mark as processed
        processedHashes.set(file, currentHash);
    }

    console.log(`Indexing complete. ${totalUpserted} new/updated chunks inserted.`);
}
