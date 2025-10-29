# TechNova AI Kundservice Chatbot

## Tech Stack

**Frontend:** React + TailwindCSS  
**Backend:** Express.js + LangChain.js  
**AI Models:**

- `llama3.1:8b` (chat model)
- `nomic-embed-text` (embeddings model)  
  **Database:** Supabase (PostgreSQL + vector extension)

---

## Requirements

- Node.js **v20+** (or v22)
- [Ollama](https://ollama.com/download) installed and running locally
- Supabase project with the provided keys (already included in `.env`)
- Policy/FAQ document ingested into Supabase

---

## Quick Start

### Install Ollama models

Open PowerShell and run:

```powershell
ollama serve
ollama pull llama3.1:8b
ollama pull nomic-embed-text
```

# Backend setup

```
cd server
npm install
```

## (Optional) Reindex the FAQ document

```
node ingest.js
```

# Start the backend

```
node index.js
```

# Expected output

```
API up on :8787
```

# Frontend setup

## In a new powershell/cmd window

```
cd client
npm install
npm run dev
```
