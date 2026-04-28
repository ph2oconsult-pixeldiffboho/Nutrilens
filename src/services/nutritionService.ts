/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FoodItem, NutrientValue, InputQuality } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface GeminiResponse {
  meal_name: string;
  items: FoodItem[];
  input_quality: InputQuality;
  clarifying_question: string | null;
  clarifying_options: string[];
  is_fallback?: boolean;
}

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
          estimated_weight_g: { type: Type.NUMBER, nullable: true },
          estimate_kcal: { type: Type.NUMBER },
          min_kcal: { type: Type.NUMBER },
          max_kcal: { type: Type.NUMBER },
          protein_g: { type: Type.NUMBER },
          carbs_g: { type: Type.NUMBER },
          uncertainty_reason: { type: Type.STRING },
        },
        required: ["name", "portion_description", "estimate_kcal", "min_kcal", "max_kcal", "protein_g", "carbs_g", "uncertainty_reason"],
      },
    },
    input_quality: { type: Type.STRING },
    clarifying_question: { type: Type.STRING, nullable: true },
    clarifying_options: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["meal_name", "items", "input_quality", "clarifying_options"],
};

const TEXT_SCHEMA: any = {
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
    clarifying_question: { type: Type.STRING, nullable: true },
    clarifying_options: { type: Type.ARRAY, items: { type: Type.STRING } },
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

function getHeuristicEstimate(description: string): GeminiResponse {
  const lower = description.toLowerCase();
  const items: FoodItem[] = [];
  
  const weightMatch = lower.match(/(\d+(?:\.\d+)?)\s*(g|gram|grams|ml|milliliters|oz|ounce|ounces|kg|kilogram|kilograms)/);
  let factor = 1;

  if (weightMatch) {
    const value = parseFloat(weightMatch[1]);
    const unit = weightMatch[2];
    let grams = value;
    if (unit.startsWith('kg')) grams = value * 1000;
    if (unit.startsWith('oz') || unit.startsWith('ounce')) grams = value * 28.35;
    factor = grams / 100;
  } else {
    factor = 1.5;
  }

  const sortedKeys = Object.keys(HEURISTICS).sort((a, b) => b.length - a.length);
  const matchedParts: string[] = [];

  for (const key of sortedKeys) {
    if (lower.includes(key)) {
      const alreadyMatched = matchedParts.some(part => part.includes(key));
      if (!alreadyMatched) {
        const data = HEURISTICS[key];
        const estKcal = data.kcal * factor;
        const estProtein = data.protein * factor;

        items.push({
          id: Math.random().toString(36).substr(2, 9),
          name: key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          servingSize: weightMatch ? `${weightMatch[1]}${weightMatch[2]}` : data.unit,
          nutrients: {
            calories: { min: estKcal * 0.9, max: estKcal * 1.1, precise: estKcal },
            protein: { min: estProtein * 0.95, max: estProtein * 1.05, precise: estProtein },
            carbs: { min: estKcal * 0.1, max: estKcal * 0.2, precise: estKcal * 0.15 },
            fat: { min: estKcal * 0.05, max: estKcal * 0.1, precise: estKcal * 0.07 }
          },
          confidence: 0.8,
          inputQuality: 'vague'
        });
        matchedParts.push(key);
      }
    }
  }

  if (items.length === 0) {
    items.push({
      id: "generic-1",
      name: "Generic Meal",
      servingSize: "Standard Portion",
      nutrients: {
        calories: { min: 400, max: 800, precise: 600 },
        protein: { min: 15, max: 35, precise: 25 },
        carbs: { min: 40, max: 80, precise: 60 },
        fat: { min: 15, max: 45, precise: 30 }
      },
      confidence: 0.2,
      inputQuality: 'vague'
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

export async function parseMealDescription(description: string): Promise<GeminiResponse> {
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

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: TEXT_SCHEMA,
      },
    });

    const rawData = JSON.parse(result.text || "{}");
    
    // Normalise/Clamp ranges locally
    if (rawData.items) {
      rawData.items = rawData.items.map((item: any) => {
        const cal = item.nutrients.calories;
        cal.precise = Math.max(10, Math.min(2000, cal.precise));
        cal.min = Math.max(5, Math.min(cal.precise, cal.min));
        cal.max = Math.max(cal.precise, Math.min(3000, cal.max));
        return {
          ...item,
          id: item.id || Math.random().toString(36).substr(2, 9)
        };
      });
    }

    return rawData as GeminiResponse;
  } catch (error) {
    console.error("Gemini Error:", error);
    return getHeuristicEstimate(description);
  }
}

export async function parseMealImage(imageB64: string): Promise<GeminiResponse> {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
          id: Math.random().toString(36).substr(2, 9),
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

    return rawData as GeminiResponse;
  } catch (error) {
    console.error("Gemini Image Error:", error);
    throw new Error("Unable to analyze this photo. Try using text or voice.");
  }
}

export async function getDaySummary(meals: any[], targets: any) {
  const res = await fetch('/api/day-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meals, targets })
  });
  if (!res.ok) throw new Error('Failed to get day summary');
  return await res.json();
}

export async function getGuidance(summary: any, targets: any) {
  const res = await fetch('/api/guidance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary, targets })
  });
  if (!res.ok) throw new Error('Failed to get guidance');
  return await res.json();
}
