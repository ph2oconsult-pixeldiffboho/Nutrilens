/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface NutrientValue {
  min: number;
  max: number;
  precise: number;
}

export interface Nutrients {
  calories: NutrientValue;
  protein: NutrientValue;
  carbs: NutrientValue;
  fat: NutrientValue; // We'll combine or simplify as "Fat" for the clean UI
}

export type InputQuality = 'vague' | 'partial' | 'weighted' | 'known_meal' | 'photo_estimate';

export interface FoodItem {
  id: string;
  name: string;
  servingSize: string;
  nutrients: Nutrients;
  confidence: number;
  inputQuality?: InputQuality;
  uncertaintyReason?: string;
  kcalPer100g?: number; // Estimated density (for logic)
  grams?: number; // User edited weight
  quantity?: number; // User edited count
}

export interface Meal {
  id: string;
  timestamp: number;
  description: string;
  items: FoodItem[];
  totalCalories: NutrientValue;
  totalProtein: NutrientValue;
  confidenceScore: number;
  inputQuality?: InputQuality;
}

export interface WeightEntry {
  id: string;
  timestamp: number;
  weight: number;
}

export type MoodType = 'Energised' | 'Good' | 'Tired' | 'Hungry' | 'Bloated' | 'Stressed';

export interface MoodEntry {
  id: string;
  timestamp: number;
  mood: MoodType;
  mealId?: string;
}

export interface NutritionTargets {
  calories: number;
  protein: number;
  startWeight: number;
  goalWeight: number;
  targetWeightDate?: string; // ISO date string
  preferredUnits: 'kg' | 'lb';
}

export type View = 'dashboard' | 'add-meal' | 'history' | 'settings' | 'trends';
