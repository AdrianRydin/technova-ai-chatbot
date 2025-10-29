import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const {
  OLLAMA_BASE_URL = "http://127.0.0.1:11434",
  OLLAMA_MODEL = "qwen2.5:7b-instruct",
  EMBED_MODEL = "nomic-embed-text",
  SUPABASE_URL,
  SUPABASE_PRIVATE_KEY,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_PRIVATE_KEY) {
  throw new Error("Saknar SUPABASE_URL eller SUPABASE_PRIVATE_KEY i .env");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_PRIVATE_KEY);

/* ------------ OLLAMA HELPERS ------------ */
async function ollamaGenerate(prompt) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.2, num_predict: 512 },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ollama generate failed: ${res.status} ${t}`);
  }
  const json = await res.json();
  return String(json.response ?? "");
}

async function ollamaEmbed(text) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: [text] }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ollama embed failed: ${res.status} ${t}`);
  }
  const json = await res.json();
  if (Array.isArray(json.embeddings) && json.embeddings[0]?.length) {
    return json.embeddings[0];
  }
  throw new Error("Empty embedding from /api/embed");
}

async function retrieveDocs(query, topK = 6) {
  const qVec = await ollamaEmbed(query);
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: qVec,
    match_count: topK,
  });
  if (error) throw error;
  return (data || []).map((row) => ({
    pageContent: row.content,
    metadata: {
      section: row.section,
      heading: row.heading,
      source: row.source,
      id: row.id,
      similarity: row.similarity,
    },
  }));
}

function formatContext(docs) {
  return docs
    .map(
      (d, i) =>
        `[#${i + 1}] (${d.metadata?.section || "Okänd sektion"} — ${
          d.metadata?.heading || "Ingen rubrik"
        })\n${d.pageContent}`
    )
    .join("\n\n");
}

function domainPrompt(question) {
  return `Svara endast JA eller NEJ.
Gäller användarens fråga TechNova AB:s produkter, leveranser, garantier, eller info i företagets FAQ/policydokument?

Fråga: ${question}`;
}

function refusalPrompt(question) {
  return `Du svarar bara på frågor om TechNova AB, dess produkter, leveranser, garantier eller FAQ/policy.
Om något ligger utanför detta: svara vänligt på svenska att du inte kan hjälpa med den typen av fråga och föreslå vad du kan svara på.

Fråga: ${question}`;
}

function qaPrompt(question, context) {
  return `Du är TechNova AB:s kundsupportassistent. Svara KORT, sakligt och på svenska.
Använd endast information från KONTEKST. Om du använder dokumenten, lista fotnoter [1], [2], ... och ange sektion & rubrik (t.ex. "§4 Retur- och återbetalningspolicy – Ångerrätt").
Om svaret inte finns i kontexten, säg att du inte hittar det i FAQ/policy och hänvisa till supportmail (support@technova.se).

KONTEKST:
${context}

FRÅGA:
${question}`;
}

export async function ask(messages) {
  const msgs = Array.isArray(messages) ? messages : [];
  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  const question = lastUser?.content?.trim() || "";
  if (!question) {
    return {
      text: "Jag behöver en fråga för att kunna hjälpa till.",
      citations: [],
    };
  }

  console.log("STEP 1: Domänvakten...");
  const dom = (await ollamaGenerate(domainPrompt(question)))
    .trim()
    .toUpperCase();
  console.log("STEP 2: Domain result =", dom);

  if (dom.startsWith("NEJ")) {
    const refusal = await ollamaGenerate(refusalPrompt(question));
    console.log("STEP 3: Refusal generated");
    return { text: refusal, citations: [] };
  }

  console.log("STEP 4: Retrieval...");
  const docs = await retrieveDocs(question, 6);
  console.log("STEP 5: Docs retrieved =", docs.length);

  console.log("STEP 6: QA prompt...");
  const context = formatContext(docs);
  const answer = await ollamaGenerate(qaPrompt(question, context));
  console.log("STEP 7: Answer length =", answer.length);

  const citations = (docs || []).map((d, i) => ({
    id: i + 1,
    section: d.metadata?.section,
    heading: d.metadata?.heading,
    source: d.metadata?.source,
  }));

  console.log("STEP 8: Returning answer");
  return { text: answer, citations };
}
