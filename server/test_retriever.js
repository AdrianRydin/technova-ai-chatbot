import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PRIVATE_KEY
);

// samma embed som server/index.js använder:
const res = await fetch(
  `${process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"}/api/embed`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.EMBED_MODEL || "nomic-embed-text",
      input: ["Hur lång är leveranstiden?"],
    }),
  }
);
const json = await res.json();
const vec = json.embeddings?.[0];
const { data, error } = await supabase.rpc("match_documents", {
  query_embedding: vec,
  match_count: 3,
});
console.log({ rows: data?.length, error, first: data?.[0] });
