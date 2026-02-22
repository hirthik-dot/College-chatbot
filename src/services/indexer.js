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
 * Helper to convert camelCase/snake_case to readable words
 */
function toReadableLabel(key) {
    if (!key) return '';
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_-]/g, ' ')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

/**
 * Traverses JSON recursively and returns one flat array of readable sentences.
 */
function jsonToReadableTextLines(obj, parentKey = "") {
    let lines = [];

    if (Array.isArray(obj)) {
        obj.forEach((item) => {
            lines = lines.concat(jsonToReadableTextLines(item, parentKey));
        });
    } else if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
            const readableKey = toReadableLabel(key);
            const contextPrefix = parentKey ? `${parentKey} ${readableKey}` : readableKey;

            if (typeof value === 'object' && value !== null) {
                // For sub-objects, append their deeper lines
                lines = lines.concat(jsonToReadableTextLines(value, contextPrefix));
            } else {
                // Primitive value: format into a sentence
                lines.push(`${contextPrefix}: ${value}.`);
            }
        }
    } else {
        // Top level primitive
        if (parentKey) {
            lines.push(`${parentKey}: ${obj}.`);
        } else {
            lines.push(`${obj}.`);
        }
    }

    return lines;
}

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

    // Directly map the website_ai_knowledge schema
    if (data && Array.isArray(data.pages)) {
        for (const page of data.pages) {
            if (!page.content || !Array.isArray(page.content)) continue;

            for (const section of page.content) {
                if (!section.text || section.text.trim().length === 0) continue;

                const finalChunkText = `[Source Page: ${page.page}]\n[Section: ${section.section}]\n${section.text.trim()}`;

                chunks.push({
                    text: finalChunkText,
                    metadata: {
                        source: page.page,
                        path: page.url || filePath,
                        section: section.section
                    }
                });
            }
        }
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

    const aiKnowledgePath = path.join(DATA_DIR, 'website_ai_knowledge.json');
    if (!fs.existsSync(aiKnowledgePath)) {
        console.log('No website_ai_knowledge.json found to index.');
        return;
    }
    const jsonFiles = [aiKnowledgePath];

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
