/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NutritionTargets, Meal, WeightEntry, MoodEntry } from './types';

export const DEFAULT_TARGETS: NutritionTargets = {
  calories: 2200,
  protein: 150,
  startWeight: 82,
  goalWeight: 75,
  preferredUnits: 'kg'
};

export const MOCK_WEIGHT_ENTRIES: WeightEntry[] = [
  { id: 'w14', timestamp: Date.now() - 86400000 * 13, weight: 82.5 },
  { id: 'w13', timestamp: Date.now() - 86400000 * 12, weight: 82.1 },
  { id: 'w12', timestamp: Date.now() - 86400000 * 11, weight: 82.3 },
  { id: 'w11', timestamp: Date.now() - 86400000 * 10, weight: 81.8 },
  { id: 'w10', timestamp: Date.now() - 86400000 * 9, weight: 81.9 },
  { id: 'w9', timestamp: Date.now() - 86400000 * 8, weight: 81.5 },
  { id: 'w8', timestamp: Date.now() - 86400000 * 7, weight: 81.6 },
  { id: 'w1', timestamp: Date.now() - 86400000 * 6, weight: 81.2 },
  { id: 'w2', timestamp: Date.now() - 86400000 * 5, weight: 80.8 },
  { id: 'w3', timestamp: Date.now() - 86400000 * 4, weight: 81.0 },
  { id: 'w4', timestamp: Date.now() - 86400000 * 3, weight: 80.5 },
  { id: 'w5', timestamp: Date.now() - 86400000 * 2, weight: 80.4 },
  { id: 'w6', timestamp: Date.now() - 86400000 * 1, weight: 79.9 },
  { id: 'w7', timestamp: Date.now(), weight: 79.8 },
];

export const MOCK_MOODS: MoodEntry[] = [
  { id: 'm1', timestamp: Date.now() - 86400000 * 2, mood: 'Energised' },
  { id: 'm2', timestamp: Date.now() - 86400000 * 1, mood: 'Good' },
  { id: 'm3', timestamp: Date.now(), mood: 'Tired' },
];

export const MOCK_MEALS: Meal[] = [
  {
    id: '1',
    timestamp: Date.now() - 3600000 * 4,
    description: 'Black coffee and a plain croissant',
    items: [
      {
        id: '1a',
        name: 'Black Coffee',
        servingSize: '1 cup',
        nutrients: {
          calories: { min: 2, max: 5, precise: 3 },
          protein: { min: 0, max: 1, precise: 0.3 },
          carbs: { min: 0, max: 1, precise: 0 },
          fat: { min: 0, max: 0.5, precise: 0 },
        },
        confidence: 0.98,
      },
      {
        id: '1b',
        name: 'Croissant',
        servingSize: '1 medium',
        nutrients: {
          calories: { min: 200, max: 350, precise: 270 },
          protein: { min: 4, max: 8, precise: 6 },
          carbs: { min: 20, max: 40, precise: 30 },
          fat: { min: 10, max: 20, precise: 15 },
        },
        confidence: 0.85,
      },
    ],
    totalCalories: { min: 202, max: 355, precise: 273 },
    totalProtein: { min: 4, max: 9, precise: 6.3 },
    confidenceScore: 0.9,
  },
];
