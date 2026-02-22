import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('data');
const OUT_FILE = path.join(DATA_DIR, 'website_ai_knowledge.json');

// Helper to convert camelCase/snake_case to readable words
function toReadableLabel(key) {
    if (!key) return '';
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_-]/g, ' ')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

function extractLosslessTextBlocks(obj, parentContext = "General Context") {
    let blocks = [];

    if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
            blocks = blocks.concat(extractLosslessTextBlocks(item, parentContext));
        });
    } else if (typeof obj === 'object' && obj !== null) {
        let textParts = [];

        for (const [key, value] of Object.entries(obj)) {
            const readableKey = toReadableLabel(key);

            // Extract role context from image filenames before skipping them
            if (key === 'image' && typeof value === 'string') {
                const imgStr = value.toLowerCase();
                if (imgStr.includes('hod')) {
                    textParts.push(`Role / Position: HOD (Head of Department)`);
                } else if (imgStr.includes('faculty')) {
                    textParts.push(`Role / Position: Faculty Member`);
                }
            }

            // Skip structural garbage
            if (key === 'id' || key === 'icon' || key === 'image' || key === 'url' || String(value).startsWith('http') || String(value).startsWith('/')) continue;

            if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
                blocks = blocks.concat(extractLosslessTextBlocks(value, `${parentContext} - ${readableKey}`));
            } else {
                // Valid primitive
                if (value && String(value).trim().length > 0) {
                    // Explicitly prefix with context to avoid floating unanchored data
                    // e.g., "Recruiters Name: Amazon" instead of just "Name: Amazon"
                    textParts.push(`${parentContext} ${readableKey}: ${String(value).trim()}`);
                }
            }
        }

        if (textParts.length > 0) {
            blocks.push({
                section: parentContext,
                text: textParts.join('. ') + '.'
            });
        }
    } else {
        if (obj && String(obj).trim().length > 0 && !String(obj).startsWith('http')) {
            blocks.push({
                section: parentContext,
                text: `${parentContext}: ${String(obj).trim()}.`
            });
        }
    }

    return blocks;
}

function processAllFiles() {
    console.log(`Starting lossless conversion of local JSON files to AI Knowledge Base...`);

    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'website_ai_knowledge.json');
    const knowledgeData = { pages: [] };
    let totalBlocksRaw = 0;

    for (const file of files) {
        console.log(`Reading ${file}...`);
        try {
            const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
            const data = JSON.parse(raw);

            const pageName = toReadableLabel(file.replace('.json', ''));
            const extractedBlocks = extractLosslessTextBlocks(data, pageName);

            // Further optimization: group tiny contiguous blocks of the exact same section
            // so we don't end up with 20k chunks of 5 words, which would blow up the API limits.
            // A good chunk size is around 50-100 words.
            const mergedBlocks = [];
            let currentMergedText = "";
            let currentSection = "";

            for (const b of extractedBlocks) {
                if (b.section !== currentSection || currentMergedText.length > 500) { // 500 chars ~ 80 words
                    if (currentMergedText.length > 0) {
                        mergedBlocks.push({ section: currentSection, text: currentMergedText.trim() });
                    }
                    currentSection = b.section;
                    currentMergedText = b.text + " ";
                } else {
                    currentMergedText += b.text + " ";
                }
            }
            if (currentMergedText.length > 0) {
                mergedBlocks.push({ section: currentSection, text: currentMergedText.trim() });
            }

            if (mergedBlocks.length > 0) {
                knowledgeData.pages.push({
                    page: pageName,
                    url: `/${pageName.toLowerCase().replace(/\s+/g, '-')}`,
                    content: mergedBlocks
                });
                totalBlocksRaw += mergedBlocks.length;
                console.log(`-> Added ${mergedBlocks.length} detailed semantic chunks for ${pageName}`);
            }

        } catch (err) {
            console.error(`Error processing ${file}: ${err.message}`);
        }
    }

    fs.writeFileSync(OUT_FILE, JSON.stringify(knowledgeData, null, 2), 'utf-8');

    console.log(`\n✅ Lossless Conversion complete!`);
    console.log(`Organized data into ${totalBlocksRaw} distinct detailed knowledge chunks.`);
    console.log(`File saved to: ${OUT_FILE}`);
}

processAllFiles();
