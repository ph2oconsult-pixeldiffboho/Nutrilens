import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";

// We'll use these interfaces to keep the server typed
interface NutrientValue {
  min: number;
  max: number;
  precise: number;
}
// ... interface definitions ...
interface FoodItem {
  name: string;
  servingSize: string;
  nutrients: {
    calories: NutrientValue;
    protein: NutrientValue;
    carbs: NutrientValue;
    fat: NutrientValue;
  };
  confidence: number;
  inputQuality: "vague" | "partial" | "weighted" | "known_meal" | "photo_estimate";
  uncertaintyReason?: string;
}

interface GeminiResponse {
  meal_name: string;
  items: FoodItem[];
  input_quality: "vague" | "partial" | "weighted" | "known_meal" | "photo_estimate";
  clarifying_question: string | null;
  clarifying_options: string[];
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const PHOTO_PROMPT = `You are estimating nutrition from a meal photo.
Return structured JSON only.
Do not return markdown or explanatory text.

Estimate:
- likely food items
- approximate portions
- best calorie estimate
- minimum plausible calories
- maximum plausible calories
- protein
- carbohydrates
- saturated fat
- polyunsaturated fat
- uncertainty reason
- one clarifying question if needed

Important rules:
- A photo alone cannot confirm weight, oil, butter, sauces, hidden ingredients, or exact portion size.
- Therefore, photo-only estimates should usually have a wide range.
- Do not return false precision.
- If the meal is complex, widen the range.
- If the meal is visually simple, still retain uncertainty.
- If multiple foods are visible, estimate each separately.

Return JSON in this schema:
{
  "meal_name": "string",
  "input_type": "photo",
  "items": [
    {
      "name": "string",
      "portion_description": "string",
      "estimated_weight_g": number | null,
      "estimate_kcal": number,
      "min_kcal": number,
      "max_kcal": number,
      "protein_g": number,
      "carbs_g": number,
      "saturated_fat_g": number,
      "polyunsaturated_fat_g": number,
      "uncertainty_reason": "string"
    }
  ],
  "total": {
    "estimate_kcal": number,
    "min_kcal": number,
    "max_kcal": number,
    "protein_g": number,
    "carbs_g": number,
    "saturated_fat_g": number,
    "polyunsaturated_fat_g": number
  },
  "input_quality": "photo_estimate",
  "clarifying_question": "string | null",
  "clarifying_options": ["string"]
}
`;

const PHOTO_RESPONSE_SCHEMA: any = {
  type: "object",
  properties: {
    meal_name: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          portion_description: { type: "string" },
          estimated_weight_g: { type: "number", nullable: true },
          estimate_kcal: { type: "number" },
          min_kcal: { type: "number" },
          max_kcal: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          uncertainty_reason: { type: "string" },
        },
        required: ["name", "portion_description", "estimate_kcal", "min_kcal", "max_kcal", "protein_g", "carbs_g", "uncertainty_reason"],
      },
    },
    input_quality: { type: "string", enum: ["photo_estimate"] },
    clarifying_question: { type: "string", nullable: true },
    clarifying_options: { type: "array", items: { type: "string" } },
  },
  required: ["meal_name", "items", "input_quality", "clarifying_options"],
};

const HEURISTICS: Record<string, { kcal: number; protein: number; unit: string; baseWeight?: number }> = {
  "sweet potato mash": { kcal: 105, protein: 1.8, unit: "100g", baseWeight: 100 },
  "sweet potato": { kcal: 86, protein: 1.6, unit: "100g", baseWeight: 100 },
  chicken: { kcal: 165, protein: 31, unit: "100g", baseWeight: 100 },
  egg: { kcal: 70, protein: 6, unit: "1 large" },
  rice: { kcal: 130, protein: 2.7, unit: "100g", baseWeight: 100 },
  steak: { kcal: 250, protein: 26, unit: "100g", baseWeight: 100 },
  apple: { kcal: 52, protein: 0.3, unit: "100g", baseWeight: 100 },
  bread: { kcal: 265, protein: 9, unit: "100g", baseWeight: 100 },
  banana: { kcal: 89, protein: 1.1, unit: "100g", baseWeight: 100 },
  salmon: { kcal: 208, protein: 20, unit: "100g", baseWeight: 100 },
  potato: { kcal: 77, protein: 2, unit: "100g", baseWeight: 100 },
  milk: { kcal: 60, protein: 3.2, unit: "100ml", baseWeight: 100 },
  avocado: { kcal: 160, protein: 2, unit: "100g", baseWeight: 100 },
  oats: { kcal: 389, protein: 16.9, unit: "100g", baseWeight: 100 },
  pasta: { kcal: 131, protein: 5, unit: "100g", baseWeight: 100 },
  broccoli: { kcal: 34, protein: 2.8, unit: "100g", baseWeight: 100 },
};

function getHeuristicEstimate(description: string) {
  const lower = description.toLowerCase();
  const items = [];
  
  // Extract potential weight/volume from description (e.g., "200g", "100ml", "5oz")
  const weightMatch = lower.match(/(\d+(?:\.\d+)?)\s*(g|gram|grams|ml|milliliters|oz|ounce|ounces|kg|kilogram|kilograms)/);
  let factor = 1;

  if (weightMatch) {
    const value = parseFloat(weightMatch[1]);
    const unit = weightMatch[2];
    
    // Convert to grams where possible for heuristic comparison
    let grams = value;
    if (unit.startsWith('kg')) grams = value * 1000;
    if (unit.startsWith('oz') || unit.startsWith('ounce')) grams = value * 28.35;
    
    // Comparison against 100g/ml base
    factor = grams / 100;
  } else {
    // Default factor if no weight given
    factor = 1.5; // Roughly 150g portion
  }

  // Sort keys by length descending to match more specific terms first
  const sortedKeys = Object.keys(HEURISTICS).sort((a, b) => b.length - a.length);
  const matchedParts: string[] = [];

  for (const key of sortedKeys) {
    if (lower.includes(key)) {
      // Check if this part of the string was already matched by a longer term
      const alreadyMatched = matchedParts.some(part => part.includes(key));
      if (!alreadyMatched) {
        const data = HEURISTICS[key];
        
        const estKcal = data.kcal * factor;
        const estProtein = data.protein * factor;

        items.push({
          name: key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          servingSize: weightMatch ? `${weightMatch[1]}${weightMatch[2]}` : data.unit,
          nutrients: {
            calories: { min: estKcal * 0.9, max: estKcal * 1.1, precise: estKcal },
            protein: { min: estProtein * 0.95, max: estProtein * 1.05, precise: estProtein },
            carbs: { min: estKcal * 0.1, max: estKcal * 0.2, precise: estKcal * 0.15 },
            fat: { min: estKcal * 0.05, max: estKcal * 0.1, precise: estKcal * 0.07 }
          },
          confidence: 0.8
        });
        matchedParts.push(key);
      }
    }
  }

  if (items.length === 0) {
    items.push({
      name: "Generic Meal",
      servingSize: "Standard Portion",
      nutrients: {
        calories: { min: 400, max: 800, precise: 600 },
        protein: { min: 15, max: 35, precise: 25 },
        carbs: { min: 40, max: 80, precise: 60 },
        fat: { min: 15, max: 45, precise: 30 }
      },
      confidence: 0.2
    });
  }

  return {
    meal_name: "Rough Estimate",
    items,
    input_quality: "vague",
    clarifying_question: "I've made a rough estimate based on common components. Was this a large portion?",
    clarifying_options: ["Small", "Average", "Large"],
    is_fallback: true
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API Routes ---

  app.post("/api/estimate-meal-photo", async (req, res) => {
    const { imageB64 } = req.body;
    if (!imageB64) {
      return res.status(400).json({ error: "Image data is required" });
    }

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{
          role: "user",
          parts: [
            { text: PHOTO_PROMPT },
            {
              inlineData: {
                data: imageB64.split(",")[1] || imageB64,
                mimeType: "image/jpeg"
              }
            }
          ]
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: PHOTO_RESPONSE_SCHEMA,
        },
      });

      const rawData = JSON.parse(result.text || "{}");

      // Apply Local Uncertainty Rules (Enforced min ±40% for photo)
      if (rawData.items) {
        rawData.items = rawData.items.map((item: any) => {
          const est = item.estimate_kcal;
          // Rule: minimum uncertainty band must be at least ±40% for photo-only
          const minBand = 0.4;
          item.min_kcal = Math.min(item.min_kcal, Math.round(est * (1 - minBand)));
          item.max_kcal = Math.max(item.max_kcal, Math.round(est * (1 + minBand)));

          // Map to standard FoodItem structure for the app
          return {
            name: item.name,
            servingSize: item.portion_description,
            nutrients: {
              calories: { min: item.min_kcal, max: item.max_kcal, precise: est },
              protein: { min: item.protein_g * 0.9, max: item.protein_g * 1.1, precise: item.protein_g },
              carbs: { min: item.carbs_g * 0.9, max: item.carbs_g * 1.1, precise: item.carbs_g },
              fat: { min: (item.saturated_fat_g || 1) * 0.9, max: (item.polyunsaturated_fat_g || 1) * 1.1, precise: (item.saturated_fat_g || 0) + (item.polyunsaturated_fat_g || 0) || 10 },
            },
            confidence: 0.6,
            inputQuality: "photo_estimate",
            uncertaintyReason: item.uncertainty_reason
          };
        });
      }

      res.json(rawData);
    } catch (error) {
      console.error("Gemini Image Error:", error);
      res.status(500).json({ error: "Failed to analyze meal photo. Please try text/voice." });
    }
  });

  app.post("/api/estimate-meal", async (req, res) => {
    const { description } = req.body;
    if (!description) {
      return res.status(400).json({ error: "Description is required" });
    }

    try {
      const prompt = `Parse this meal: "${description}". 
      Return structured JSON only. 
      Rules:
      - STRICT WEIGHT CALCULATION: If weight (e.g. "100g") is provided, base calories strictly on weight (e.g. sweet potato: ~86-90kcal per 100g).
      - PREPARATION PREMIUM: For "mash", only add +15% for implied preparation. DO NOT overestimate.
      - CONFIDENCE: If weight is provided, set confidence to 0.95.
      - If no weight, assume standard portion sizes (e.g. "a bowl" ~ 350g, "a slice" ~ 40g).
      - If vague (e.g. "curry"), input_quality: 'vague', widen calorie ranges (±40%).
      - If portion assumed (e.g. "a bowl"), input_quality: 'partial', range ±25%.
      - If weight provided, input_quality: 'weighted', range ±10%.
      - Always provide min/max/precise for nutrients.`;

      const schema: any = {
        type: "object",
        properties: {
          meal_name: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                servingSize: { type: "string" },
                nutrients: {
                  type: "object",
                  properties: {
                    calories: {
                      type: "object",
                      properties: {
                        min: { type: "number" },
                        max: { type: "number" },
                        precise: { type: "number" },
                      },
                      required: ["min", "max", "precise"],
                    },
                    protein: {
                      type: "object",
                      properties: {
                        min: { type: "number" },
                        max: { type: "number" },
                        precise: { type: "number" },
                      },
                      required: ["min", "max", "precise"],
                    },
                    carbs: {
                      type: "object",
                      properties: {
                        min: { type: "number" },
                        max: { type: "number" },
                        precise: { type: "number" },
                      },
                      required: ["min", "max", "precise"],
                    },
                    fat: {
                      type: "object",
                      properties: {
                        min: { type: "number" },
                        max: { type: "number" },
                        precise: { type: "number" },
                      },
                      required: ["min", "max", "precise"],
                    },
                  },
                  required: ["calories", "protein", "carbs", "fat"],
                },
                confidence: { type: "number" },
              },
              required: ["name", "servingSize", "nutrients", "confidence"],
            },
          },
          input_quality: { type: "string", enum: ["vague", "partial", "weighted", "known_meal"] },
          clarifying_question: { type: "string", nullable: true },
          clarifying_options: { type: "array", items: { type: "string" } },
        },
        required: ["meal_name", "items", "input_quality", "clarifying_options"],
      };

      const result = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });

      const responseText = result.text;
      const rawData = JSON.parse(responseText || "{}");
      
      // Post-process: Clamping to realistic ranges (50 - 2000 kcal per meal)
      if (rawData.items) {
        rawData.items = rawData.items.map((item: any) => {
          const cal = item.nutrients.calories;
          cal.precise = Math.max(10, Math.min(2000, cal.precise));
          cal.min = Math.max(5, Math.min(cal.precise, cal.min));
          cal.max = Math.max(cal.precise, Math.min(3000, cal.max));
          return item;
        });
      }

      res.json(rawData);
    } catch (error) {
      console.error("Gemini Error:", error);
      // Fallback heuristic estimate
      const fallback = getHeuristicEstimate(description);
      res.json(fallback);
    }
  });

  app.post("/api/normalise-meal", (req, res) => {
    const { mealData } = req.body;
    if (!mealData || !mealData.items) return res.status(400).json({ error: "Valid meal data is required" });

    const normalisedItems = mealData.items.map((item: any) => {
      let quality = item.inputQuality || mealData.input_quality;
      const est = item.nutrients.calories.precise;
      
      let band = 0.25;
      if (quality === 'vague') band = 0.45;
      if (quality === 'weighted') band = 0.1;
      
      // Ensure min/max reflect the quality band if they are too narrow
      const minBound = Math.round(est * (1 - band) / 5) * 5;
      const maxBound = Math.round(est * (1 + band) / 5) * 5;

      return {
        ...item,
        inputQuality: quality,
        nutrients: {
          ...item.nutrients,
          calories: {
            precise: est,
            min: Math.min(item.nutrients.calories.min, minBound),
            max: Math.max(item.nutrients.calories.max, maxBound),
          }
        }
      };
    });

    res.json({
      ...mealData,
      items: normalisedItems
    });
  });

  app.post("/api/day-summary", (req, res) => {
    const { meals, targets } = req.body;
    if (!meals || !targets) return res.status(400).json({ error: "Meals and targets are required" });

    const summary = meals.reduce((acc: any, meal: any) => {
      acc.calories += meal.totalCalories.precise;
      acc.upperBoundCals += meal.totalCalories.max;
      acc.protein += meal.totalProtein.precise;
      return acc;
    }, { calories: 0, upperBoundCals: 0, protein: 0 });

    const remainingCals = targets.calories - summary.calories;
    const safeRemaining = targets.calories - summary.upperBoundCals;

    res.json({
      ...summary,
      remainingCals,
      safeRemaining,
      calPercent: (summary.calories / targets.calories) * 100
    });
  });

  app.post("/api/guidance", (req, res) => {
    const { summary, targets } = req.body;
    if (!summary || !targets) return res.status(400).json({ error: "Summary and targets are required" });

    const { calories, upperBoundCals, protein } = summary;
    const remaining = targets.calories - calories;
    const safeRemaining = targets.calories - upperBoundCals;
    const proteinRatio = protein / (targets.protein || 1);
    
    let nextGuidance = "";
    let insightText = "";
    const hour = new Date().getHours();

    // Guidance Logic
    if (remaining <= 0) {
      nextGuidance = "You've reached your target for today.";
    } else if (safeRemaining < 0) {
      nextGuidance = "Your logged meals have some uncertainty — your next meal might take you over your target.";
    } else if (safeRemaining < 200) {
      nextGuidance = "You're getting close to your limit when accounting for uncertainty.";
    } else if (remaining < 300) {
      nextGuidance = "The remaining room is quite small; your next meal might exceed your target.";
    } else {
      nextGuidance = `You have plenty of room today. ~${Math.round(remaining)} kcal remaining.`;
    }

    // Insight Logic
    if (remaining < 0) {
      insightText = "Target reached.";
    } else if (safeRemaining < 100) {
      insightText = "Entries are near your daily budget.";
    } else if (remaining < 300) {
      insightText = "Approaching your daily limit.";
    } else if (hour < 11) {
      insightText = "You have plenty of room today.";
    } else if (hour < 16) {
      insightText = "7-day trend is moving toward your goal.";
    } else {
      insightText = "Likely room for a light evening meal.";
    }

    res.json({ nextGuidance, insightText });
  });

  // --- Vite Middleware ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
