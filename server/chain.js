import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  RunnableSequence,
  RunnablePassthrough,
} from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";

const {
  OLLAMA_BASE_URL = "http://127.0.0.1:11434",
  OLLAMA_MODEL = "llama3.1:8b",
  EMBED_MODEL = "nomic-embed-text",
  SUPABASE_URL,
  SUPABASE_PRIVATE_KEY,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_PRIVATE_KEY) {
  throw new Error("Saknar SUPABASE_URL eller SUPABASE_PRIVATE_KEY i .env");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_PRIVATE_KEY);

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

const chatModel = new ChatOllama({
  baseUrl: OLLAMA_BASE_URL,
  model: OLLAMA_MODEL,
  temperature: 0.2,
});

const DOMAIN_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Svara endast JA eller NEJ.
Gäller användarens fråga TechNova AB:s produkter, leveranser, garantier, eller info i företagets FAQ/policydokument?`,
  ],
  ["user", "{question}"],
]);

const REFUSAL_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Du svarar bara på frågor om TechNova AB, dess produkter, leveranser, garantier eller FAQ/policy.
Om något ligger utanför detta: svara vänligt på svenska att du inte kan hjälpa med den typen av fråga och föreslå vad du kan svara på.`,
  ],
  ["user", "{question}"],
]);

const QA_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Du är TechNova AB:s kundsupportassistent. Svara KORT, sakligt och på svenska.
Använd endast information från KONTEKST. Om du använder dokumenten, lista fotnoter [1], [2], ... och ange sektion & rubrik (t.ex. "§4 Retur- och återbetalningspolicy – Ångerrätt").
Om svaret inte finns i kontexten, säg att du inte hittar det i FAQ/policy och hänvisa till supportmail (support@technova.se).`,
  ],
  ["system", "KONTEKST:\n{context}"],
  ["user", "{question}"],
]);

const classifyChain = RunnableSequence.from([
  DOMAIN_PROMPT,
  chatModel,
  new StringOutputParser(),
]);

const refusalChain = RunnableSequence.from([
  REFUSAL_PROMPT,
  chatModel,
  new StringOutputParser(),
]);

const ragChain = RunnableSequence.from([
  // Steg 1: hämta dokument och bygg kontext
  async (input) => {
    const docs = await retrieveDocs(input.question, 6);
    const context = formatContext(docs);
    return { ...input, docs, context };
  },
  // Steg 2: kör QA-prompten med modellen och parsa svaret
  RunnablePassthrough.assign({
    answer: QA_PROMPT.pipe(chatModel).pipe(new StringOutputParser()),
  }),
  // Steg 3: forma slutligt svar + citations
  (obj) => {
    const citations = (obj.docs || []).map((d, i) => ({
      id: i + 1,
      section: d.metadata?.section,
      heading: d.metadata?.heading,
      source: d.metadata?.source,
    }));

    return {
      text: obj.answer,
      citations,
    };
  },
]);

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

  console.log("STEP 1: Domänvakten via LangChain...");
  const dom = (await classifyChain.invoke({ question })).trim().toUpperCase();
  console.log("STEP 2: Domain result =", dom);

  // Utanför TechNova-domänen → använd refusalChain
  if (dom.startsWith("NEJ")) {
    console.log("STEP 3: Out-of-domain, generating refusal via LangChain...");
    const refusalText = await refusalChain.invoke({ question });
    return { text: refusalText, citations: [] };
  }

  console.log("STEP 4: In-domain, running RAG chain...");
  const result = await ragChain.invoke({ question });
  console.log(
    "STEP 5: RAG chain done, answer length =",
    result.text?.length || 0
  );

  return result;
}
