import "dotenv/config";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { ask } from "./chain.js";
console.log("SERVER BOOT: typeof ask =", typeof ask);

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));

app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/ask", async (req, res) => {
  try {
    const { messages } = req.body;
    console.log(
      "HIT /ask",
      Array.isArray(req.body?.messages) && req.body.messages.length
    );
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: "messages required" });
    }
    const answer = await ask(messages);
    return res.json(answer);
  } catch (err) {
    console.error("POST /ask error:", err);
    return res.status(500).json({
      error: "internal_error",
      message: err?.message,
      stack: err?.stack,
    });
  }
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => console.log(`API up on :${port}`));
