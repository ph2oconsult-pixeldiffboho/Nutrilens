import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const PHOTO_PROMPT = `You are estimating nutrition from a meal photo.
Return structured JSON only.
Do not return markdown or explanatory text.

Estimate:
- likely food items
- approximate portions
- best calorie estimate
- minimum plausible calories
- maximum plausible calories
- protein (grams)
- carbohydrates (grams)
- fat (grams)
- uncertainty reason
- one clarifying question if needed

Important rules:
- A photo alone cannot confirm weight, oil, butter, sauces, hidden ingredients, or exact portion size.
- Therefore, photo-only estimates should usually have a wide range.
- Do not return false precision.
- If the meal is complex, widen the range.
- If the meal is visually simple, still retain uncertainty.
- If multiple foods are visible, estimate each separately.`;

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.post("/api/meal/parse-text", async (req, res) => {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: "Missing description" });

    try {
      const prompt = `You are a professional nutrition analyzer. Parse this meal: "${description}".
RULES:
1. PRECISION: If specific quantities (g, oz, cups, pieces) are mentioned, base calculations strictly on those.
2. NO GENERIC 600KCAL: If the food is low calorie (coffee, carrot, etc.), do NOT return high-calorie estimates. A medium banana is ~90-100kcal. Coffee is ~2kcal. 
3. INGREDIENT DECOMPOSITION: If the description contains multiple items (e.g. "coffee and a croissant"), return them as separate items in the array.
4. CALORIC DENSITY: Be accurate for fruits and simple items. 
5. UNCERTAINTY: Use the uncertainty_reason to explain why you chose a specific range.

Return structured JSON only.`;

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: TEXT_SCHEMA,
        },
      });

      res.json(JSON.parse(response.text || "{}"));
    } catch (error: any) {
      console.error("Server Text Parse Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meal/parse-image", async (req, res) => {
    const { imageB64, mimeType } = req.body;
    if (!imageB64) return res.status(400).json({ error: "Missing image data" });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{
          role: "user",
          parts: [
            { text: PHOTO_PROMPT },
            {
              inlineData: {
                data: imageB64.includes(",") ? imageB64.split(",")[1] : imageB64,
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

      res.json(JSON.parse(response.text || "{}"));
    } catch (error: any) {
      console.error("Server Image Parse Error:", error);
      res.status(500).json({ error: error.message });
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
