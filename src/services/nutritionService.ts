/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FoodItem, NutrientValue, InputQuality } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

const GEMINI_API_KEY = (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '') || '';
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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
- If multiple foods are visible, estimate each separately.

Return JSON in the specified schema.`;

const PHOTO_RESPONSE_SCHEMA = {
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
    clarifying_question: { type: Type.STRING, description: "One question to narrow down uncertainty, or empty string if none." },
    clarifying_options: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["meal_name", "items", "input_quality", "clarifying_question", "clarifying_options"],
};


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
- STRICT WEIGHT CALCULATION: If weight (e.g. "100g") is provided, base calories strictly on weight.
- If no weight, assume standard portion sizes (e.g. "a bowl" ~ 350g, "a slice" ~ 40g).
- Always provide min/max/precise for nutrients.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: TEXT_SCHEMA,
      },
    });

    const text = response.text || "{}";
    const rawData = JSON.parse(text);
    
    if (rawData.items) {
      rawData.items = rawData.items.map((item: any) => {
        const nutrients = item.nutrients || {};
        const cal = nutrients.calories || { precise: 0, min: 0, max: 0 };
        const pro = nutrients.protein || { precise: 0, min: 0, max: 0 };
        const crb = nutrients.carbs || { precise: 0, min: 0, max: 0 };
        const fat = nutrients.fat || { precise: 0, min: 0, max: 0 };

        cal.precise = Math.max(10, Math.min(2000, cal.precise || 0));
        cal.min = Math.max(5, Math.min(cal.precise, cal.min || 0));
        cal.max = Math.max(cal.precise, Math.min(3000, cal.max || 0));

        return {
          ...item,
          id: item.id || Math.random().toString(36).substr(2, 9),
          nutrients: {
            calories: cal,
            protein: pro,
            carbs: crb,
            fat: fat
          }
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
    // Detect mime type
    let mimeType = "image/jpeg";
    if (imageB64.startsWith("data:")) {
      const match = imageB64.match(/^data:([^;]+);base64,/);
      if (match) {
        mimeType = match[1];
      }
    }
    
    const base64Data = imageB64.includes(",") ? imageB64.split(",")[1] : imageB64;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: {
        parts: [
          { text: PHOTO_PROMPT },
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: PHOTO_RESPONSE_SCHEMA,
      },
    });

    const text = response.text || "{}";
    const rawData = JSON.parse(text);

    if (rawData.items) {
      rawData.items = rawData.items.map((item: any) => {
        const est = item.estimate_kcal || 0;
        const minVal = item.min_kcal || Math.round(est * 0.6);
        const maxVal = item.max_kcal || Math.round(est * 1.4);

        return {
          id: Math.random().toString(36).substr(2, 9),
          name: item.name,
          servingSize: item.portion_description,
          nutrients: {
            calories: { min: minVal, max: maxVal, precise: est },
            protein: { min: (item.protein_g || 0) * 0.9, max: (item.protein_g || 0) * 1.1, precise: item.protein_g || 0 },
            carbs: { min: (item.carbs_g || 0) * 0.9, max: (item.carbs_g || 0) * 1.1, precise: item.carbs_g || 0 },
            fat: { min: (item.fat_g || 1) * 0.8, max: (item.fat_g || 1) * 1.2, precise: item.fat_g || 7 },
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
  const summary = meals.reduce((acc: any, meal: any) => {
    acc.calories += meal.totalCalories.precise;
    acc.upperBoundCals += meal.totalCalories.max;
    acc.protein += meal.totalProtein.precise;
    return acc;
  }, { calories: 0, upperBoundCals: 0, protein: 0 });

  const remainingCals = targets.calories - summary.calories;
  const safeRemaining = targets.calories - summary.upperBoundCals;

  return {
    ...summary,
    remainingCals,
    safeRemaining,
    calPercent: (summary.calories / targets.calories) * 100
  };
}

export async function getGuidance(summary: any, targets: any) {
  const { calories, upperBoundCals, protein } = summary;
  const remaining = targets.calories - calories;
  const safeRemaining = targets.calories - upperBoundCals;
  
  let nextGuidance = "";
  let insightText = "";
  const hour = new Date().getHours();

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

  return { nextGuidance, insightText };
}
