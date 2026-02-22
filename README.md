# College Chatbot Backend

A production-ready AI chatbot backend that reads local JSON files, generates text embeddings using HuggingFace's free inference API, stores them in an in-memory ChromaDB vector store, and provides conversational answers via OpenRouter's free models.

## Features

- **Automated Indexing**: Scans `./data/*.json` files on server startup. Hashes each file to detect changes and only indexes updated/new files.
- **RAG Pipeline**: Exposes a `/chat` endpoint that performs similarity search on your JSON chunks and fetches an LLM answer.
- **Free-Tier Friendly**: Built for platforms like Vercel, Railway, or Render. Relies entirely on free LLM and Embedding endpoints, and rebuilding index on boot sidesteps serverless storage wiping.

## Prerequisites

- Node.js (v18 or higher)
- [HuggingFace API Key](https://huggingface.co/settings/tokens) (Free)
- [OpenRouter API Key](https://openrouter.ai/keys) (Free tier available)

## Setup Instructions

1. **Clone the repository or switch to this backend folder.**
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Configure Environment Variables**:
   Copy the example config:
   ```bash
   cp .env.example .env
   ```
   Add your `HUGGINGFACE_API_KEY` and `OPENROUTER_API_KEY` in the `.env` file.

4. **Add JSON data**:
   By default, there is a `sample.json` file in the `data/` folder. Place any other `.json` files representing your institutional data inside the `data/` folder. The system will recursively read and flatten them.

5. **Run Locally**:
   ```bash
   npm run dev
   ```
   The backend will start, initialize the Vector DB, scan `data/*.json`, compute chunks, and be ready when `Server is listening on port 3000` is logged.

## API Endpoints

### 1. `POST /chat`

Requires a JSON body with the question.
```bash
curl -X POST http://localhost:3000/chat \
-H "Content-Type: application/json" \
-d '{"question": "Who is the head of computer science?"}'
```

**Response format**:
```json
{
  "answer": "Dr. Alice Smith is the head of the Computer Science department.",
  "sources": ["sample.json"]
}
```

### 2. `POST /reindex`

Force the indexer to rescan the `data` folder and rebuild embeddings for changed files.
```bash
curl -X POST http://localhost:3000/reindex
```

## Example Frontend Integration

Use this simple fetch call to integrate the backend into your existing static college site:

```javascript
async function askChatbot(userQuestion) {
  try {
    const response = await fetch('https://your-backend-url.com/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ question: userQuestion })
    });
    
    const data = await response.json();
    console.log("Answer:", data.answer);
    console.log("Sources:", data.sources.join(', '));
    return data;
  } catch (err) {
    console.error("Chatbot temporarily unavailable.");
  }
}
```

## Deployment

**To Vercel (Serverless)**:
1. Add a `vercel.json` file bridging `server.js` using `@vercel/node`. (Wait, standard Express requires special configuration on Vercel, but modern Vercel can run Express with a `vercel.json` rewrite.)
2. Add the environment variables `HUGGINGFACE_API_KEY` and `OPENROUTER_API_KEY` in the Vercel project dashboard.
3. Keep in mind that Vercel serverless functions have a max execution time (10s on free), which might impact the `/chat` route if OpenRouter is slow. Also, ChromaDB may have issues running natively in Vercel. 

**To Railway or Render (Recommended)**:
Because this app relies on in-memory collections and processing, standard Docker or Node.js environments like **Render Web Services** or **Railway** are recommended.
1. Connect your Github repository to Render or Railway.
2. Set build command: `npm install`
3. Set start command: `npm start`
4. Set ENV variables (`HUGGINGFACE_API_KEY`, `OPENROUTER_API_KEY`).
5. Your service will be online and available!

> Notice: Since Railway and Render spin down instances, each cold start will trigger indexing. This is handled gracefully by our `indexer.js` but will delay the very first request by a few seconds.
