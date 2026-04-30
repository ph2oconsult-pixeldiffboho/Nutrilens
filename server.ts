import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const PHOTO_PROMPT = `Analyze this meal photo.
Return ONLY structured JSON. No preamble. No markdown.

JSON Schema:
{
  "meal_name": "string",
  "items": [
    {
      "name": "string",
      "portion_description": "string",
      "estimate_kcal": number,
      "min_kcal": number,
      "max_kcal": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number,
      "uncertainty_reason": "string"
    }
  ],
  "input_quality": "photo_estimate",
  "clarifying_question": "string",
  "clarifying_options": ["string"]
}

Rules:
- Identify every food item visible.
- Be realistic. A bunch of bananas should be ~100kcal per medium banana.
- If unsure, broaden the calorie range.
- Provide a helpful clarifying question if it helps accuracy (e.g. "Was anything cooked in oil?").`;

const TEXT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    meal_name: { type: Type.STRING },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          servingSize: { type: Type.STRING },
          nutrients: {
            type: Type.OBJECT,
            properties: {
              calories: {
                type: Type.OBJECT,
                properties: {
                  min: { type: Type.NUMBER },
                  max: { type: Type.NUMBER },
                  precise: { type: Type.NUMBER },
                },
                required: ["min", "max", "precise"],
              },
              protein: {
                type: Type.OBJECT,
                properties: {
                  min: { type: Type.NUMBER },
                  max: { type: Type.NUMBER },
                  precise: { type: Type.NUMBER },
                },
                required: ["min", "max", "precise"],
              },
              carbs: {
                type: Type.OBJECT,
                properties: {
                  min: { type: Type.NUMBER },
                  max: { type: Type.NUMBER },
                  precise: { type: Type.NUMBER },
                },
                required: ["min", "max", "precise"],
              },
              fat: {
                type: Type.OBJECT,
                properties: {
                  min: { type: Type.NUMBER },
                  max: { type: Type.NUMBER },
                  precise: { type: Type.NUMBER },
                },
                required: ["min", "max", "precise"],
              },
            },
            required: ["calories", "protein", "carbs", "fat"],
          },
          confidence: { type: Type.NUMBER },
        },
        required: ["name", "servingSize", "nutrients", "confidence"],
      },
    },
    input_quality: { type: Type.STRING },
    clarifying_question: { type: Type.STRING },
    clarifying_options: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["meal_name", "items", "input_quality", "clarifying_options"],
};

const PHOTO_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    meal_name: { type: Type.STRING },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          portion_description: { type: Type.STRING },
          estimate_kcal: { type: Type.NUMBER },
          min_kcal: { type: Type.NUMBER },
          max_kcal: { type: Type.NUMBER },
          protein_g: { type: Type.NUMBER },
          carbs_g: { type: Type.NUMBER },
          fat_g: { type: Type.NUMBER },
          uncertainty_reason: { type: Type.STRING },
        },
        required: ["name", "portion_description", "estimate_kcal", "min_kcal", "max_kcal", "protein_g", "carbs_g", "fat_g", "uncertainty_reason"],
      },
    },
    input_quality: { type: Type.STRING },
    clarifying_question: { type: Type.STRING },
    clarifying_options: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["meal_name", "items", "input_quality", "clarifying_question", "clarifying_options"],
};

function safeParseJSON(text: string) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    throw e;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.post("/api/meal/parse-text", async (req, res) => {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: "Missing description" });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: `You are a professional nutrition analyzer. Parse this meal: "${description}".
RULES:
1. PRECISION: Base calculations on quantities if mentioned. A medium banana is ~90-100kcal. 
2. INGREDIENT DECOMPOSITION: Separate items.
3. Return structured JSON only.` }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: TEXT_SCHEMA,
        },
      });

      res.json(safeParseJSON(response.text || "{}"));
    } catch (error: any) {
      console.error("Server Text Parse Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meal/parse-image", async (req, res) => {
    const { imageB64, mimeType } = req.body;
    if (!imageB64) return res.status(400).json({ error: "Missing image data" });

    try {
      const base64Data = imageB64.includes(",") ? imageB64.split(",")[1] : imageB64;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{
          role: "user",
          parts: [
            { text: PHOTO_PROMPT },
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType || "image/jpeg"
              }
            }
          ]
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: PHOTO_SCHEMA,
        },
      });

      const responseText = response.text;
      if (!responseText) throw new Error("Empty response from AI");
      
      res.json(safeParseJSON(responseText));
    } catch (error: any) {
      console.error("Server Image Parse Error:", error);
      res.status(500).json({ error: error.message, details: error.stack });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
