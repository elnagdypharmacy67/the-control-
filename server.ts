import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Parse order using Gemini API
  app.post("/api/parse-order", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Missing order text content to parse." });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured in environment secrets." });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Extract the product names and their requested quantity from the following order or receipt message. Clean up formatting (like bold asterisks or parenthetical numbers) but keep the exact product name words intact so we can match them back to a product search. Keep names in Arabic if written in Arabic, or English if in English.
Order message:
${text}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: {
                  type: Type.STRING,
                  description: "The name of the product product in the message.",
                },
                quantity: {
                  type: Type.INTEGER,
                  description: "The count or quantity of this product.",
                },
              },
              required: ["name", "quantity"],
            },
          },
        },
      });

      const resultText = response.text || "[]";
      let parsed = [];
      try {
        parsed = JSON.parse(resultText.trim());
      } catch (err) {
        console.error("Failed to parse JSON response from Gemini:", resultText);
        parsed = [];
      }

      res.json(parsed);
    } catch (err: any) {
      console.error("Gemini parse error:", err);
      res.status(500).json({ error: err.message || "An error occurred while parsing the order message." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
