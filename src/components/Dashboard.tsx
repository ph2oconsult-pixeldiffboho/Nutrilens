/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Info } from 'lucide-react';
import { NutritionTargets, Meal } from '../types';
import { APP_VERSION } from '../constants';

interface DashboardProps {
  progress: { calories: number; protein: number; upperBoundCals: number };
  targets: NutritionTargets;
  todayMeals: Meal[];
  insightText: string;
  nextGuidance: string;
  proteinStatus: string;
  onNavigateToHistory: () => void;
  onResetToday: () => void;
}

export function Dashboard({ progress, targets, todayMeals, insightText, nextGuidance, proteinStatus, onNavigateToHistory, onResetToday }: DashboardProps) {
  const [showProteinNumbers, setShowProteinNumbers] = useState(false);
  const remainingCals = targets.calories - progress.calories;
  const calPercent = Math.min((progress.calories / targets.calories) * 100, 100);

  return (
    <div className="space-y-12 px-6 pt-12 pb-32">
      <header className="flex justify-between items-start">
        <div className="space-y-1">
          <p className="text-secondary text-sm font-medium tracking-tight uppercase italic">Nutilens</p>
          <h1 className="text-4xl font-bold tracking-tight text-white">Daily Focus</h1>
        </div>
        <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full border-2 border-accent/40" />
        </div>
      </header>

      {/* Main Energy Card - Focus on Remaining */}
      <div className="apple-card p-10 bg-white/[0.02] border-white/[0.02] relative overflow-hidden group">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="space-y-8 relative z-10"
        >
          <div className="flex justify-between items-end">
            <div className="space-y-1">
              <p className="text-secondary text-[10px] font-bold uppercase tracking-[0.2em]">Remaining</p>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 0.2 }}
                className="text-7xl font-bold tracking-tighter tabular-nums text-text-primary"
              >
                {Math.max(0, Math.round(remainingCals))}
              </motion.p>
            </div>
          </div>

          <div className="h-[2px] w-full bg-white/[0.05] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${calPercent}%` }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
              className="h-full bg-accent/40 transition-all"
            />
          </div>
          
          <div className="flex items-center gap-2 text-text-secondary">
            <p className="text-sm font-medium italic">
              {insightText}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Next Guidance Section */}
      <section className="space-y-4">
        <p className="text-secondary text-[10px] font-bold uppercase tracking-[0.2em] px-1">Next</p>
        <div className="apple-card p-8 bg-white/[0.01] border-white/[0.01] flex items-start gap-4">
          <div className="mt-1">
            <Info size={18} className="text-accent/30" />
          </div>
          <p className="text-xl font-medium leading-tight text-text-primary/90 italic tracking-tight">
            {nextGuidance}
          </p>
        </div>
      </section>

      {/* Protein Status - Calm text */}
      <section className="grid grid-cols-1 gap-6">
        <button 
          onClick={() => setShowProteinNumbers(!showProteinNumbers)}
          className="apple-card p-8 flex items-center justify-between group active:scale-[0.99] transition-all bg-white/[0.01]"
        >
          <div className="space-y-1 text-left">
            <div className="flex items-center gap-3">
               <p className="text-secondary text-[10px] font-bold uppercase tracking-widest leading-none">Protein</p>
            </div>
            <AnimatePresence mode="wait">
              {showProteinNumbers ? (
                <motion.p 
                  key="numbers"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="text-2xl font-bold tracking-tight tabular-nums mt-1 text-text-primary"
                >
                  {Math.round(progress.protein)} <span className="text-secondary text-sm font-medium">of {targets.protein}g</span>
                </motion.p>
              ) : (
                <motion.p 
                  key="status"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="text-2xl font-bold tracking-tight mt-1 text-text-primary"
                >
                  {proteinStatus === 'on track' ? 'Consuming enough' : proteinStatus === 'low' ? 'You likely need more' : 'High intake'}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <ChevronRight size={20} className="text-white/5 group-hover:text-accent/40 transition-colors" />
        </button>
      </section>

      {/* Recent Activity */}
      <section className="space-y-6">
        <div className="flex items-end justify-between px-1 text-white">
          <div className="flex items-center gap-4">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-secondary">Today's Meals</h2>
            {todayMeals.length > 0 && (
              <button 
                onClick={() => {
                  if (confirm("Clear all logs for today?")) onResetToday();
                }}
                className="text-[10px] font-bold uppercase tracking-widest text-accent hover:text-white transition-colors"
                id="reset-today-btn"
              >
                Reset
              </button>
            )}
          </div>
          <button 
            onClick={onNavigateToHistory}
            className="text-[10px] font-bold uppercase tracking-widest text-secondary hover:text-white transition-colors flex items-center gap-1"
          >
            All <ChevronRight size={14} />
          </button>
        </div>
        
        <div className="space-y-3 text-white">
          {todayMeals.slice(0, 3).map((meal) => (
            <div 
              key={meal.id} 
              className="apple-card p-6 flex items-center justify-between transition-all hover:bg-white/10 bg-white/[0.02]"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold tracking-tight text-white/90">{meal.description}</p>
                  {meal.confidenceScore < 0.4 && (
                    <div className="group relative">
                      <motion.div 
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Info size={12} className="text-accent cursor-help" />
                      </motion.div>
                      <div className="absolute bottom-full left-0 mb-2 p-2 bg-black/90 border border-white/10 rounded text-[10px] w-32 hidden group-hover:block z-50">
                        Rough estimate. Clarify ingredients for better accuracy.
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-secondary">
                    {new Date(meal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {meal.mealType && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-white/10" />
                      <p className="text-[10px] uppercase font-bold tracking-widest text-accent/80">
                        {meal.mealType}
                      </p>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-xl tabular-nums">
                  {Math.round(meal.totalCalories.precise)}
                </p>
                <p className="text-[10px] uppercase font-bold tracking-widest text-secondary">kcal</p>
              </div>
            </div>
          ))}
          {todayMeals.length === 0 && (
            <div className="apple-card p-12 border-dashed border-white/10 bg-transparent flex flex-col items-center justify-center space-y-2 opacity-50">
              <p className="text-secondary font-medium italic">Your log is empty.</p>
            </div>
          )}
        </div>
      </section>

      <div className="pt-12 pb-8 flex justify-center opacity-10 hover:opacity-100 transition-opacity">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-secondary">
          v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}
