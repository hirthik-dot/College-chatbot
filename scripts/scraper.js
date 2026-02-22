import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

// IMPORTANT: Axios + Cheerio CANNOT scrape a frontend React SPA (like Vite's "npm run dev")
// because Vite only sends an empty `<div id="root"></div>` over the network before executing JS.
// You MUST point this script at an SEO-friendly Static or Server-Side Rendered (SSR) URL.
// Or, if building a static site from Vite, run it against the preview server.
const START_URL = process.env.TARGET_URL || 'https://hit.edu.in/cse/';
const BASE_DOMAIN = new URL(START_URL).origin;

const visited = new Set();
const knowledgeData = { pages: [] };

async function crawl(url) {
    if (visited.has(url)) return;
    visited.add(url);

    try {
        console.log(`Crawling: ${url}`);
        const response = await axios.get(url, {
            // Some production servers block raw axios requests; masking as a browser helps.
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 10000
        });
        const html = response.data;
        const $ = cheerio.load(html);

        // First, check if this is an empty React SPA container.
        if ($('#root').length > 0 && $('h1, h2, h3, p').length < 2) {
            console.warn(`\n⚠️  WARNING: ${url} appears to be a client-side React SPA.`);
            console.warn(`Axios cannot execute JavaScript. It only sees an empty <div id="root">.`);
            console.warn(`To scrape this website, you either need to prerender your Vite app (SSG/SSR),`);
            console.warn(`or you must use a headless browser like Puppeteer instead of Axios.\n`);
            return;
        }

        // Remove navigation, footers, scripts, and other non-informative UI junk
        $('nav, footer, header, script, style, noscript, svg, button, form, iframe, .sidebar, .menu, .navbar').remove();

        const pageTitle = $('title').text().trim() || url;
        const pageContent = [];
        let currentSection = 'General Info';
        let currentTextLines = [];

        // Parse content systematically by walking through main elements
        $('body').find('h1, h2, h3, h4, h5, h6, p, ul, ol, td, th').each((_, el) => {
            const tagName = el.tagName.toLowerCase();
            const $el = $(el);

            let text = $el.text().replace(/\s+/g, ' ').trim();
            if (!text || text.length < 3) return;

            // When we hit a new heading, save the previous section's text
            if (tagName.startsWith('h')) {
                if (currentTextLines.length > 0) {
                    pageContent.push({
                        section: currentSection,
                        text: currentTextLines.join(' ')
                    });
                    currentTextLines = [];
                }
                currentSection = text;
            } else if (tagName === 'ul' || tagName === 'ol') {
                $el.find('li').each((_, li) => {
                    const liText = $(li).text().replace(/\s+/g, ' ').trim();
                    if (liText && liText.length > 2) {
                        currentTextLines.push(`${liText}.`);
                    }
                });
            } else if (tagName === 'p' || tagName === 'td' || tagName === 'th') {
                if (!text.endsWith('.') && !text.endsWith('?') && !text.endsWith('!')) {
                    text += '.';
                }
                currentTextLines.push(text);
            }
        });

        // Push the final section 
        if (currentTextLines.length > 0) {
            pageContent.push({
                section: currentSection,
                text: currentTextLines.join(' ')
            });
        }

        if (pageContent.length > 0) {
            knowledgeData.pages.push({
                page: pageTitle,
                url: url,
                content: pageContent
            });
            console.log(`  -> Saved ${pageContent.length} sections from ${pageTitle}`);
        } else {
            console.log(`  -> No textual content found on ${url}`);
        }

        // Find all internal links and crawl them recursively
        const links = [];
        $('a').each((_, el) => {
            const href = $(el).attr('href');
            if (href) {
                try {
                    const resolvedUrl = new URL(href, url).href;
                    if (resolvedUrl.startsWith(`${BASE_DOMAIN}/cse`) && !resolvedUrl.includes('#')) {
                        links.push(resolvedUrl);
                    }
                } catch (e) { }
            }
        });

        for (const link of links) {
            if (!visited.has(link)) {
                await crawl(link);
            }
        }

    } catch (err) {
        console.error(`Failed to crawl ${url}:`, err.message);
    }
}

async function startScraping() {
    console.log(`Starting crawl at: ${START_URL}`);
    console.log(`(Using strictly Axios & Cheerio. Requires SSR or Static HTML output)`);

    await crawl(START_URL);

    const outPath = path.resolve('data/website_ai_knowledge.json');
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(outPath, JSON.stringify(knowledgeData, null, 2), 'utf-8');

    console.log(`\n✅ Crawl complete!`);
    console.log(`Stored structured knowledge of ${knowledgeData.pages.length} pages inside ${outPath}`);
}

startScraping();
