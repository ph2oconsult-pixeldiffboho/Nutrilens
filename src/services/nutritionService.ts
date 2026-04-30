/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FoodItem, NutrientValue, InputQuality } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is missing. Please add it in the Settings menu (top right).');
    }
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
}

export interface GeminiResponse {
  meal_name: string;
  items: FoodItem[];
  input_quality: InputQuality;
  clarifying_question: string | null;
  clarifying_options: string[];
  is_fallback?: boolean;
}

const PHOTO_PROMPT = `Analyze this meal photo.
Estimate nutrition for each item.
Return structured JSON only.

Rules:
- Identify every food item visible.
- Be realistic. A medium banana is ~90-100kcal.
- Provide "kcal_per_100g" for each item (best estimate for density).
- If unsure, broaden the calorie range.
- Provide a helpful clarifying question if it helps accuracy.`;

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
          kcal_per_100g: { type: Type.NUMBER },
          uncertainty_reason: { type: Type.STRING },
        },
        required: ["name", "portion_description", "estimate_kcal", "min_kcal", "max_kcal", "protein_g", "carbs_g", "fat_g", "kcal_per_100g", "uncertainty_reason"],
      },
    },
    input_quality: { type: Type.STRING },
    clarifying_question: { type: Type.STRING },
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
          kcal_per_100g: { type: Type.NUMBER },
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
        required: ["name", "servingSize", "kcal_per_100g", "nutrients", "confidence"],
      },
    },
    input_quality: { type: Type.STRING },
    clarifying_question: { type: Type.STRING },
    clarifying_options: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["meal_name", "items", "input_quality", "clarifying_options"],
};


const HEURISTICS: Record<string, { kcal: number; protein: number; unit: string; baseWeight?: number }> = {
  // Proteins
  "chicken breast": { kcal: 165, protein: 31, unit: "100g" },
  "chicken wing": { kcal: 200, protein: 18, unit: "1 piece" },
  "chicken thigh": { kcal: 209, protein: 26, unit: "100g" },
  "chicken": { kcal: 165, protein: 31, unit: "100g" },
  "steak": { kcal: 250, protein: 26, unit: "100g" },
  "beef": { kcal: 250, protein: 26, unit: "100g" },
  "minced beef": { kcal: 250, protein: 26, unit: "100g" },
  "ground beef": { kcal: 250, protein: 26, unit: "100g" },
  "pork": { kcal: 242, protein: 27, unit: "100g" },
  "salmon": { kcal: 208, protein: 20, unit: "100g" },
  "white fish": { kcal: 90, protein: 20, unit: "100g" },
  "cod": { kcal: 82, protein: 18, unit: "100g" },
  "tuna": { kcal: 132, protein: 28, unit: "100g" },
  "egg": { kcal: 70, protein: 6, unit: "1 large" },
  "boiled egg": { kcal: 70, protein: 6, unit: "1 large" },
  "fried egg": { kcal: 90, protein: 6, unit: "1 large" },
  "scrambled egg": { kcal: 100, protein: 7, unit: "1 large" },
  "omelette": { kcal: 154, protein: 11, unit: "100g" },
  "tofu": { kcal: 76, protein: 8, unit: "100g" },
  
  // Grains/Carbs
  "white rice": { kcal: 130, protein: 2.7, unit: "100g" },
  "brown rice": { kcal: 110, protein: 2.6, unit: "100g" },
  "rice": { kcal: 130, protein: 2.7, unit: "100g" },
  "pasta": { kcal: 131, protein: 5, unit: "100g" },
  "spaghetti": { kcal: 158, protein: 6, unit: "100g" },
  "bread": { kcal: 265, protein: 9, unit: "slice" },
  "toast": { kcal: 80, protein: 3, unit: "1 slice" },
  "bagel": { kcal: 250, protein: 10, unit: "1 bagel" },
  "sweet potato": { kcal: 86, protein: 1.6, unit: "100g" },
  "potato": { kcal: 77, protein: 2, unit: "100g" },
  "fries": { kcal: 312, protein: 3.4, unit: "100g" },
  "chips": { kcal: 312, protein: 3.4, unit: "100g" },
  "oats": { kcal: 389, protein: 16.9, unit: "100g" },
  "porridge": { kcal: 71, protein: 2.5, unit: "100g" },
  "muesli": { kcal: 340, protein: 10, unit: "100g" },
  "cereal": { kcal: 370, protein: 8, unit: "100g" },
  
  // Fruit/Veg
  "apple": { kcal: 52, protein: 0.3, unit: "1 medium" },
  "banana": { kcal: 89, protein: 1.1, unit: "1 medium" },
  "orange": { kcal: 47, protein: 0.9, unit: "1 medium" },
  "strawberry": { kcal: 32, protein: 0.7, unit: "100g" },
  "blueberry": { kcal: 57, protein: 0.7, unit: "100g" },
  "carrot": { kcal: 41, protein: 0.9, unit: "1 medium" },
  "broccoli": { kcal: 34, protein: 2.8, unit: "100g" },
  "spinach": { kcal: 23, protein: 2.9, unit: "100g" },
  "salad": { kcal: 20, protein: 1, unit: "1 bowl" },
  "avocado": { kcal: 160, protein: 2, unit: "100g" },
  "cucumber": { kcal: 15, protein: 0.7, unit: "100g" },
  "tomato": { kcal: 18, protein: 0.9, unit: "100g" },
  
  // Dairy/Drinks
  "milk": { kcal: 42, protein: 3.4, unit: "100ml" },
  "yogurt": { kcal: 60, protein: 3.5, unit: "100g" },
  "greek yogurt": { kcal: 100, protein: 10, unit: "100g" },
  "cheese": { kcal: 400, protein: 25, unit: "100g" },
  "butter": { kcal: 717, protein: 0.9, unit: "1 tbsp" },
  "coffee": { kcal: 2, protein: 0.1, unit: "1 cup" },
  "black coffee": { kcal: 2, protein: 0.1, unit: "1 cup" },
  "latte": { kcal: 120, protein: 7, unit: "1 cup" },
  "cappuccino": { kcal: 80, protein: 5, unit: "1 cup" },
  "espresso": { kcal: 3, protein: 0.1, unit: "1 shot" },
  "tea": { kcal: 1, protein: 0, unit: "1 cup" },
  "coke": { kcal: 140, protein: 0, unit: "1 can" },
  "juice": { kcal: 45, protein: 0.5, unit: "100ml" },
  
  // Meals/Others
  "pizza slice": { kcal: 285, protein: 12, unit: "1 slice" },
  "pizza": { kcal: 266, protein: 11, unit: "100g" },
  "burger": { kcal: 295, protein: 17, unit: "1 burger" },
  "sandwich": { kcal: 250, protein: 12, unit: "1 sandwich" },
  "sushi": { kcal: 150, protein: 5, unit: "1 roll" },
  "soup": { kcal: 50, protein: 2, unit: "100ml" },
  "curry": { kcal: 150, protein: 8, unit: "100g" },
  "ramen": { kcal: 450, protein: 15, unit: "1 bowl" },
  "pad thai": { kcal: 650, protein: 25, unit: "1 portion" },
  "taco": { kcal: 210, protein: 12, unit: "1 taco" },
  "burrito": { kcal: 700, protein: 30, unit: "1 burrito" },
  "sushi roll": { kcal: 250, protein: 10, unit: "6 pieces" },
  "pancake": { kcal: 227, protein: 6, unit: "1 pancake" },
  "waffle": { kcal: 290, protein: 8, unit: "1 waffle" },
  "soup bowl": { kcal: 150, protein: 5, unit: "1 bowl" },
  "miso soup": { kcal: 40, protein: 3, unit: "1 bowl" },
  "pho": { kcal: 450, protein: 25, unit: "1 bowl" },
  "dim sum": { kcal: 60, protein: 3, unit: "1 piece" },
  "dumpling": { kcal: 60, protein: 3, unit: "1 piece" },
  "water": { kcal: 0, protein: 0, unit: "1 cup" },
  "green tea": { kcal: 2, protein: 0, unit: "1 cup" },
};

function getHeuristicEstimate(description: string): GeminiResponse {
  const lower = description.toLowerCase();
  const items: FoodItem[] = [];
  
  // Split description by common separators
  const parts = lower.split(/,|\band\b| \+ /).map(p => p.trim()).filter(p => p.length > 0);
  
  const weightMatch = lower.match(/(\d+(?:\.\d+)?)\s*(g|gram|grams|ml|milliliters|oz|ounce|ounces|kg|kilogram|kilograms)/);
  let globalFactor = weightMatch ? 1 : 1.2;

  if (weightMatch) {
    const value = parseFloat(weightMatch[1]);
    const unit = weightMatch[2];
    let grams = value;
    if (unit.startsWith('kg')) grams = value * 1000;
    if (unit.startsWith('oz') || unit.startsWith('ounce')) grams = value * 28.35;
    globalFactor = grams / 100;
  }

  for (const part of parts) {
    let bestMatch: string | null = null;
    let maxOverlap = 0;
    
    for (const key of Object.keys(HEURISTICS)) {
      if (part.includes(key) && key.length > maxOverlap) {
        bestMatch = key;
        maxOverlap = key.length;
      }
    }
    
    if (bestMatch) {
      const data = HEURISTICS[bestMatch];
      // If the part is exactly the match, use the weight factor IF it specifically refers to THIS part or IF there's only one part
      const useFactor = (parts.length === 1 || part === bestMatch) ? globalFactor : 1.0;
      
      const estKcal = data.kcal * useFactor;
      const estProtein = data.protein * useFactor;
      const density = data.unit.includes('100g') || data.unit.includes('100ml') ? data.kcal : (data.kcal / 1.5); // very rough density if per unit

      items.push({
        id: Math.random().toString(36).substr(2, 9),
        name: part.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        servingSize: (useFactor !== 1.0 && weightMatch) ? `${weightMatch[1]}${weightMatch[2]}` : data.unit,
        nutrients: {
          calories: { min: estKcal * 0.8, max: estKcal * 1.2, precise: estKcal },
          protein: { min: estProtein * 0.9, max: estProtein * 1.1, precise: estProtein },
          carbs: { min: estKcal * 0.1, max: estKcal * 0.2, precise: estKcal * 0.15 },
          fat: { min: estKcal * 0.05, max: estKcal * 0.1, precise: estKcal * 0.07 }
        },
        confidence: 0.7,
        inputQuality: (parts.length === 1 && bestMatch === part) ? 'known_meal' : 'vague',
        uncertaintyReason: "Estimated from common values",
        kcalPer100g: density
      });
    } else {
      // Small item and context heuristic
      const isLowCal = /coffee|tea|water|carrot|cucumber|lettuce|celery|spinach|broccoli|kale|pepper/.test(part);
      const isIndulgent = /pizza|burger|cake|cookie|brownie|fry|fries|chip|butter|oil|grease/.test(part);
      const isPortionMatch = part.match(/small|large|tiny|huge|big/);
      
      let baseCals = 250; // default
      if (isLowCal) baseCals = 15;
      else if (isIndulgent) baseCals = 450;
      
      if (isPortionMatch) {
        if (/small|tiny/.test(part)) baseCals *= 0.6;
        if (/large|huge|big/.test(part)) baseCals *= 1.6;
      }
      
      items.push({
        id: Math.random().toString(36).substr(2, 9),
        name: part.charAt(0).toUpperCase() + part.slice(1),
        servingSize: "1 portion",
        nutrients: {
          calories: { min: baseCals * 0.5, max: baseCals * 1.5, precise: baseCals },
          protein: { min: baseCals * 0.02, max: baseCals * 0.08, precise: baseCals * 0.05 },
          carbs: { min: baseCals * 0.1, max: baseCals * 0.2, precise: baseCals * 0.15 },
          fat: { min: baseCals * 0.01, max: baseCals * 0.05, precise: baseCals * 0.03 }
        },
        confidence: 0.1,
        inputQuality: 'vague',
        uncertaintyReason: "Generic fallback"
      });
    }
  }

  if (items.length === 0) {
    items.push({
      id: "generic-1",
      name: "Generic Meal",
      servingSize: "Standard Portion",
      nutrients: {
        calories: { min: 250, max: 600, precise: 400 },
        protein: { min: 10, max: 25, precise: 18 },
        carbs: { min: 30, max: 60, precise: 45 },
        fat: { min: 10, max: 25, precise: 18 }
      },
      confidence: 0.1,
      inputQuality: 'vague'
    });
  }

  return {
    meal_name: "Rough Estimate",
    items,
    input_quality: "vague",
    clarifying_question: "I've matched these items using standard values. Could you specify weight or portion sizes for better accuracy?",
    clarifying_options: ["100g", "Average Portion", "Large Portion"],
    is_fallback: true
  };
}

export async function parseMealDescription(description: string): Promise<GeminiResponse> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a professional nutrition analyzer. Parse this meal: "${description}".
RULES:
1. PRECISION: Base calculations on quantities if mentioned. A medium banana is ~90-100kcal. 
2. INGREDIENT DECOMPOSITION: Separate items into distinct objects.
3. DISCRIMINATION: Do not use generic high-calorie values for low-calorie foods.
4. CALORIE DENSITY: Provide estimated kcal_per_100g for every item.
5. Return structured JSON only.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: TEXT_SCHEMA,
      },
    });

    const text = response.text;
    const rawData = text ? JSON.parse(text) : {};
    
    if (rawData && rawData.items) {
      rawData.items = rawData.items.map((item: any) => {
        const nutrients = item.nutrients || {};
        const cal = nutrients.calories || { precise: 0, min: 0, max: 0 };
        const pro = nutrients.protein || { precise: 0, min: 0, max: 0 };
        const crb = nutrients.carbs || { precise: 0, min: 0, max: 0 };
        const fat = nutrients.fat || { precise: 0, min: 0, max: 0 };

        return {
          ...item,
          id: item.id || Math.random().toString(36).substr(2, 9),
          nutrients: {
            calories: {
              precise: Math.max(0, cal.precise || 0),
              min: Math.max(0, cal.min || 0),
              max: Math.max(cal.precise || 0, cal.max || 0)
            },
            protein: pro,
            carbs: crb,
            fat: fat
          },
          confidence: item.confidence || 0.5,
          inputQuality: rawData.input_quality || 'partial',
          kcalPer100g: item.kcal_per_100g
        };
      });
    }

    return {
      meal_name: rawData.meal_name || "Meal Estimate",
      items: rawData.items || [],
      input_quality: (rawData.input_quality || "partial") as InputQuality,
      clarifying_question: rawData.clarifying_question || null,
      clarifying_options: rawData.clarifying_options || []
    };
  } catch (error) {
    console.error("Gemini Error:", error);
    return getHeuristicEstimate(description);
  }
}

export async function parseMealImage(imageB64: string): Promise<GeminiResponse> {
  try {
    let mimeType = "image/jpeg";
    if (imageB64.startsWith("data:")) {
      const match = imageB64.match(/^data:([^;]+);base64,/);
      if (match) mimeType = match[1];
    }
    
    const base64Data = imageB64.includes(",") ? imageB64.split(",")[1] : imageB64;

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { text: PHOTO_PROMPT },
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: PHOTO_SCHEMA,
      },
    });

    const text = response.text;
    const rawData = text ? JSON.parse(text) : {};

    if (rawData && rawData.items) {
      rawData.items = rawData.items.map((item: any) => {
        const est = item.estimate_kcal || 0;
        const minVal = item.min_kcal || Math.round(est * 0.6);
        const maxVal = item.max_kcal || Math.round(est * 1.4);

        return {
          id: Math.random().toString(36).substr(2, 9),
          name: item.name || "Unknown Food",
          servingSize: item.portion_description || "Estimated portion",
          nutrients: {
            calories: { min: minVal, max: maxVal, precise: est },
            protein: { min: (item.protein_g || 0) * 0.9, max: (item.protein_g || 0) * 1.1, precise: item.protein_g || 0 },
            carbs: { min: (item.carbs_g || 0) * 0.9, max: (item.carbs_g || 0) * 1.1, precise: item.carbs_g || 0 },
            fat: { min: (item.fat_g || 1) * 0.8, max: (item.fat_g || 1) * 1.2, precise: item.fat_g || 7 },
          },
          confidence: 0.6,
          inputQuality: "photo_estimate",
          uncertaintyReason: item.uncertainty_reason,
          kcalPer100g: item.kcal_per_100g
        };
      });
    }

    return {
      meal_name: rawData.meal_name || "Photo Analysis",
      items: rawData.items || [],
      input_quality: (rawData.input_quality || "photo_estimate") as InputQuality,
      clarifying_question: rawData.clarifying_question || null,
      clarifying_options: rawData.clarifying_options || []
    };
  } catch (error: any) {
    console.error("Gemini Image Error:", error);
    throw error;
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
