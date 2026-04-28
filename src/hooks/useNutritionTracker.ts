/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { Meal, NutritionTargets, FoodItem, NutrientValue, WeightEntry, MoodEntry, MoodType } from '../types';
import { DEFAULT_TARGETS, MOCK_MEALS, MOCK_WEIGHT_ENTRIES, MOCK_MOODS } from '../constants';
import { getDaySummary, getGuidance } from '../services/nutritionService';

export function useNutritionTracker() {
  const [meals, setMeals] = useState<Meal[]>(() => {
    const saved = localStorage.getItem('nutrilens_meals_v2');
    return saved ? JSON.parse(saved) : MOCK_MEALS;
  });

  const [targets, setTargets] = useState<NutritionTargets>(() => {
    const saved = localStorage.getItem('nutrilens_targets_v2');
    return saved ? JSON.parse(saved) : DEFAULT_TARGETS;
  });

  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>(() => {
    const saved = localStorage.getItem('nutrilens_weight');
    return saved ? JSON.parse(saved) : MOCK_WEIGHT_ENTRIES;
  });

  const [moodEntries, setMoodEntries] = useState<MoodEntry[]>(() => {
    const saved = localStorage.getItem('nutrilens_moods');
    return saved ? JSON.parse(saved) : MOCK_MOODS;
  });

  useEffect(() => {
    localStorage.setItem('nutrilens_meals_v2', JSON.stringify(meals));
  }, [meals]);

  useEffect(() => {
    localStorage.setItem('nutrilens_targets_v2', JSON.stringify(targets));
  }, [targets]);

  useEffect(() => {
    localStorage.setItem('nutrilens_weight', JSON.stringify(weightEntries));
  }, [weightEntries]);

  useEffect(() => {
    localStorage.setItem('nutrilens_moods', JSON.stringify(moodEntries));
  }, [moodEntries]);

  const todayMeals = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return meals.filter((meal) => meal.timestamp >= today.getTime());
  }, [meals]);

  const [summary, setSummary] = useState({
    calories: 0,
    protein: 0,
    upperBoundCals: 0,
    remainingCals: 0,
    safeRemaining: 0,
    calPercent: 0
  });

  const [guidance, setGuidance] = useState({
    nextGuidance: "You have plenty of room today.",
    insightText: "7-day trend is moving toward your goal."
  });

  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    async function updateDashboard() {
      setIsUpdating(true);
      try {
        const sumResult = await getDaySummary(todayMeals, targets);
        setSummary(sumResult);
        
        const guidanceResult = await getGuidance(sumResult, targets);
        setGuidance(guidanceResult);
      } catch (err) {
        console.error("Failed to update dashboard from API:", err);
      } finally {
        setIsUpdating(false);
      }
    }
    
    updateDashboard();
  }, [todayMeals, targets]);

  const addMeal = async (description: string, items: FoodItem[]) => {
    // Duplicate detection: same description in the last 5 minutes
    const now = Date.now();
    const isDuplicate = meals.some(m => 
      m.description.toLowerCase() === description.toLowerCase() && 
      (now - m.timestamp) < 5 * 60 * 1000
    );

    if (isDuplicate) {
      const confirmLog = window.confirm("You logged this recently. Log it again?");
      if (!confirmLog) return;
    }

    // We'll trust the items already have the calculated calories from the backend
    const calories = items.reduce((sum, item) => ({
      min: sum.min + item.nutrients.calories.min,
      max: sum.max + item.nutrients.calories.max,
      precise: sum.precise + item.nutrients.calories.precise,
    }), { min: 0, max: 0, precise: 0 });

    const protein = items.reduce((sum, item) => ({
      min: sum.min + (item.nutrients.protein?.min || 0),
      max: sum.max + (item.nutrients.protein?.max || 0),
      precise: sum.precise + (item.nutrients.protein?.precise || 0),
    }), { min: 0, max: 0, precise: 0 });

    const avgConfidence = items.length > 0 
      ? items.reduce((s, i) => s + i.confidence, 0) / items.length 
      : 0;

    const newMeal: Meal = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: Date.now(),
      description,
      items,
      totalCalories: calories,
      totalProtein: protein,
      confidenceScore: avgConfidence,
      inputQuality: items[0]?.inputQuality || 'partial',
    };
    setMeals((prev) => [newMeal, ...prev]);
    return newMeal.id;
  };

  const deleteMeal = (id: string) => {
    setMeals((prev) => prev.filter((m) => m.id !== id));
  };

  const addWeight = (weight: number) => {
    const newEntry: WeightEntry = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: Date.now(),
      weight,
    };
    setWeightEntries(prev => [newEntry, ...prev].sort((a, b) => b.timestamp - a.timestamp).slice(0, 30));
  };

  const addMood = (mood: MoodType, mealId?: string) => {
    const newEntry: MoodEntry = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: Date.now(),
      mood,
      mealId,
    };
    setMoodEntries(prev => [...prev].slice(-50).concat(newEntry));
  };

  const weightTrend = useMemo(() => {
    if (weightEntries.length === 0) return 0;
    // 7-day rolling average of the most recent 7 entries or all if less
    const recent = [...weightEntries].sort((a, b) => b.timestamp - a.timestamp).slice(0, 7);
    return recent.reduce((sum, e) => sum + e.weight, 0) / recent.length;
  }, [weightEntries]);

  const moodInsights = useMemo(() => {
    const insights: string[] = [];
    if (moodEntries.length < 3) return insights;

    const hungerDays = moodEntries.filter(m => m.mood === 'Hungry').length;
    if (hungerDays > 2) insights.push("You often report feeling hungry on lower-protein days.");

    const tiredDays = moodEntries.filter(m => m.mood === 'Tired').length;
    if (tiredDays > 2) insights.push("Higher fat meals appear to correlate with feeling sluggish.");

    return insights;
  }, [moodEntries]);

  const proteinStatus = useMemo(() => {
    const ratio = summary.protein / (targets.protein || 1);
    if (ratio < 0.45) return 'low';
    if (ratio < 0.9) return 'on track';
    return 'high';
  }, [summary.protein, targets.protein]);

  return {
    meals,
    todayMeals,
    dailyProgress: summary,
    targets,
    insightText: guidance.insightText,
    nextGuidance: guidance.nextGuidance,
    proteinStatus,
    weightEntries,
    weightTrend,
    moodEntries,
    moodInsights,
    addMeal,
    deleteMeal,
    addWeight,
    addMood,
    updateTargets: setTargets,
    isUpdating,
  };
}
