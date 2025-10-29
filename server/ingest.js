import "dotenv/config";
import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_URL,
  SUPABASE_PRIVATE_KEY,
  SUPABASE_TABLE = "docs",
  OLLAMA_BASE_URL = "http://127.0.0.1:11434",
  EMBED_MODEL = "nomic-embed-text",
} = process.env;

if (!SUPABASE_URL || !SUPABASE_PRIVATE_KEY) {
  console.error("Saknar SUPABASE_URL eller SUPABASE_PRIVATE_KEY i .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_PRIVATE_KEY);

async function ollamaEmbed(text) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: [text] }),
  });
  if (!res.ok)
    throw new Error(`Ollama embed failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (Array.isArray(json.embeddings) && json.embeddings[0]?.length)
    return json.embeddings[0];
  throw new Error("Empty embedding from /api/embed");
}

function chunk(text, size = 900, overlap = 150) {
  if (typeof text !== "string") return [];
  const out = [];
  const step = Math.max(1, size - Math.min(overlap, size - 1));
  for (let i = 0; i < text.length; i += step)
    out.push(text.slice(i, Math.min(i + size, text.length)));
  return out.map((t) => t.trim()).filter(Boolean);
}

function parseSections(raw) {
  if (!raw?.trim()) return [];
  const lines = raw.split(/\r?\n/);
  const blocks = [];
  let current = { section: "Allmänt", heading: "Start", buf: [] };
  for (const line of lines) {
    const m = line.match(/^(\d+)\.\s+(.*)$/);
    if (m) {
      if (current.buf.length) blocks.push(current);
      current = {
        section: `${m[1]}. ${m[2]}`.trim(),
        heading: m[2].trim(),
        buf: [],
      };
    } else current.buf.push(line);
  }
  if (current.buf.length) blocks.push(current);

  const docs = [];
  for (const b of blocks) {
    const parts = chunk(b.buf.join("\n").trim());
    for (const p of parts) {
      docs.push({
        content: p,
        metadata: {
          section: b.section,
          heading: b.heading,
          source: "technova_faq_policy.txt",
          lang: "sv",
        },
      });
    }
  }
  return docs;
}

function toBatches(arr, size = 64) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log("Läser policy…");
  const raw = await fs.readFile(
    new URL("./faq_source/technova_faq_policy.txt", import.meta.url),
    "utf8"
  );
  const docs = parseSections(raw);
  if (!docs.length) {
    console.error("Inga dokument hittades.");
    process.exit(1);
  }
  console.log(`Parsed ${docs.length} chunks.`);

  const batches = toBatches(docs, 64);
  let inserted = 0;

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    console.log(
      `Embedding batch ${bi + 1}/${batches.length} (size=${batch.length})…`
    );
    const vecs = [];
    for (const d of batch) vecs.push(await ollamaEmbed(d.content));

    const rows = batch.map((d, i) => ({
      content: d.content,
      embedding: vecs[i],
      source: d.metadata.source,
      section: d.metadata.section,
      heading: d.metadata.heading,
      lang: d.metadata.lang,
    }));

    const { error } = await supabase.from(SUPABASE_TABLE).insert(rows);
    if (error) {
      console.error("Supabase insert error:", error);
      process.exit(1);
    }

    inserted += rows.length;
    console.log(`Insertat totalt: ${inserted}/${docs.length}`);
  }
  console.log(`Klart. Indexerat ${inserted} chunks till '${SUPABASE_TABLE}'.`);
}
main().catch((e) => {
  console.error("Ingest fel:", e);
  process.exit(1);
});
