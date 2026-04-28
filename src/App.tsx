/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNutritionTracker } from './hooks/useNutritionTracker';
import { View } from './types';

// Components
import { Dashboard } from './components/Dashboard';
import { Navigation } from './components/Navigation';
import { AddMeal } from './components/AddMeal';
import { Trends } from './components/Trends';
import { MealHistory } from './components/MealHistory';
import { Settings } from './components/Settings';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const {
    meals,
    todayMeals,
    dailyProgress,
    targets,
    insightText,
    nextGuidance,
    proteinStatus,
    weightEntries,
    weightTrend,
    moodEntries,
    moodInsights,
    addMeal,
    deleteMeal,
    addWeight,
    addMood,
    resetToday,
    clearWeightHistory,
    clearAllHistory,
    resetTargets,
    updateTargets,
  } = useNutritionTracker();

  const handleSaveMeal = async (description: string, items: any[], mood?: any, timestamp?: number) => {
    const mealId = await addMeal(description, items, timestamp);
    if (mood) addMood(mood, mealId);
    setCurrentView('dashboard');
  };

  return (
    <div className="min-h-screen bg-app-bg text-text-primary pb-20 select-none selection:bg-accent selection:text-black">
      <main className="max-w-md mx-auto relative min-h-screen">
        <AnimatePresence mode="wait">
          {currentView === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <Dashboard
                progress={dailyProgress}
                targets={targets}
                todayMeals={todayMeals}
                insightText={insightText}
                nextGuidance={nextGuidance}
                proteinStatus={proteinStatus}
                onNavigateToHistory={() => setCurrentView('trends')}
                onResetToday={resetToday}
              />
            </motion.div>
          )}

          {currentView === 'add-meal' && (
            <motion.div
              key="add-meal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="fixed inset-0 z-50 overflow-y-auto bg-app-bg no-scrollbar"
            >
              <AddMeal
                onSave={handleSaveMeal}
                onCancel={() => setCurrentView('dashboard')}
              />
            </motion.div>
          )}

          {currentView === 'trends' && (
            <motion.div
              key="trends"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <div className="space-y-4">
                <Trends
                  weightEntries={weightEntries}
                  weightTrend={weightTrend}
                  moodEntries={moodEntries}
                  moodInsights={moodInsights}
                  targets={targets}
                  onAddWeight={addWeight}
                  onAddMood={addMood}
                  onClearHistory={clearWeightHistory}
                />
                <div className="h-[1px] w-full bg-white/[0.03] mx-6" />
                <MealHistory
                  meals={meals}
                  onDelete={deleteMeal}
                  onClearAll={clearAllHistory}
                />
              </div>
            </motion.div>
          )}

          {currentView === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <Settings
                targets={targets}
                onUpdate={updateTargets}
                onResetDefaults={resetTargets}
                onClearWeights={clearWeightHistory}
                onClearAll={clearAllHistory}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Navigation
        currentView={currentView}
        onNavigate={setCurrentView}
      />
    </div>
  );
}
