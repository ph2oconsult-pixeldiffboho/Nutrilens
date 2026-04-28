/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FoodItem, NutrientValue, InputQuality } from '../types';

export interface GeminiResponse {
  meal_name: string;
  items: FoodItem[];
  input_quality: InputQuality;
  clarifying_question: string | null;
  clarifying_options: string[];
  is_fallback?: boolean;
}

export async function parseMealDescription(description: string): Promise<GeminiResponse> {
  try {
    const estimateRes = await fetch('/api/estimate-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    });
    
    if (!estimateRes.ok) throw new Error('Failed to estimate meal');
    const rawData = await estimateRes.json();

    const normaliseRes = await fetch('/api/normalise-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mealData: rawData })
    });

    if (!normaliseRes.ok) throw new Error('Failed to normalise meal');
    return await normaliseRes.json();
  } catch (error) {
    console.error("API Error:", error);
    throw new Error("Unable to estimate this meal. Try listing components separately.");
  }
}

export async function parseMealImage(imageB64: string): Promise<GeminiResponse> {
  try {
    const res = await fetch('/api/estimate-meal-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageB64 })
    });
    
    if (!res.ok) throw new Error('Failed to analyze meal photo');
    return await res.json();
  } catch (error) {
    console.error("API Error:", error);
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
