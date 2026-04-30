/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Meal } from '../types';
import { Trash2, Calendar } from 'lucide-react';

interface MealHistoryProps {
  meals: Meal[];
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function MealHistory({ meals, onDelete, onClearAll }: MealHistoryProps) {
  const groupedMeals = meals.slice(0, 50).reduce((acc, meal) => {
    const date = new Date(meal.timestamp).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    if (!acc[date]) acc[date] = [];
    acc[date].push(meal);
    return acc;
  }, {} as Record<string, Meal[]>);

  return (
    <div className="pb-40 px-6 pt-12">
      <header className="space-y-1 mb-12 flex justify-between items-end">
        <div className="space-y-1">
          <p className="text-secondary text-sm font-medium tracking-tight uppercase">Activity</p>
          <h1 className="text-4xl font-bold tracking-tight text-white">History</h1>
        </div>
        {meals.length > 0 && (
          <button 
            onClick={() => {
              if (confirm("Clear all meal records? This cannot be undone.")) onClearAll();
            }}
            className="text-[10px] font-bold uppercase tracking-widest text-accent hover:text-white transition-colors"
            id="clear-all-history-btn"
          >
            Clear All
          </button>
        )}
      </header>

      <div className="space-y-12">
        {Object.entries(groupedMeals).map(([date, dayMeals]) => (
          <div key={date} className="space-y-6">
            <div className="flex items-center gap-3 px-1">
              <Calendar size={14} className="text-secondary" />
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">{date}</h2>
            </div>
            
            <div className="space-y-4">
              {dayMeals.map((meal) => (
                <div key={meal.id} className="apple-card p-8 bg-white/[0.01] border-white/[0.02] transition-all hover:bg-white/[0.03] group">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <p className="font-bold text-xl leading-tight tracking-tight text-text-primary/90 italic">{meal.description}</p>
                      <div className="flex items-center gap-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">
                          {new Date(meal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => onDelete(meal.id)} 
                      className="p-2 text-white/5 hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <div className="mt-8 pt-8 border-t border-white/[0.03] flex gap-10">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Energy</p>
                      <div className="flex flex-col">
                        <p className="text-2xl font-bold tracking-tight tabular-nums text-text-primary">
                          {Math.round(meal.totalCalories.precise)}
                          <span className="text-xs font-medium text-secondary ml-1">kcal</span>
                        </p>
                        {meal.totalCalories.max - meal.totalCalories.min > 50 && (
                          <p className="text-secondary text-[10px] tabular-nums font-medium">
                            ({Math.round(meal.totalCalories.min)}–{Math.round(meal.totalCalories.max)})
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Protein</p>
                      <p className="text-2xl font-bold tracking-tight tabular-nums text-text-primary">
                        {Math.round(meal.totalProtein.precise)}
                        <span className="text-xs font-medium text-secondary ml-1">g</span>
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        
        {meals.length === 0 && (
          <div className="py-20 text-center apple-card bg-transparent border-dashed border-white/10 opacity-30">
            <p className="text-secondary font-medium italic">Empty log</p>
          </div>
        )}
      </div>
    </div>
  );
}
