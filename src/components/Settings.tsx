/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, FormEvent } from 'react';
import { NutritionTargets } from '../types';
import { Check, RotateCcw } from 'lucide-react';
import { DEFAULT_TARGETS } from '../constants';

interface SettingsProps {
  targets: NutritionTargets;
  onUpdate: (targets: NutritionTargets) => void;
  onResetDefaults: () => void;
  onClearWeights: () => void;
  onClearAll: () => void;
}

export function Settings({ targets, onUpdate, onResetDefaults, onClearWeights, onClearAll }: SettingsProps) {
  const [localTargets, setLocalTargets] = useState(targets);
  const [isSaved, setIsSaved] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onUpdate(localTargets);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleReset = () => {
    if (confirm("Reset nutrition targets to defaults?")) {
      onResetDefaults();
      setLocalTargets(DEFAULT_TARGETS);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }
  };

  const handleChange = (field: keyof NutritionTargets, value: string) => {
    if (field === 'targetWeightDate' || field === 'preferredUnits') {
      setLocalTargets(prev => ({ ...prev, [field]: value }));
      return;
    }
    const numValue = Number(value);
    if (isNaN(numValue)) return;
    setLocalTargets(prev => ({ ...prev, [field]: numValue }));
  };

  return (
    <div className="pb-40 px-6 pt-12">
      <header className="space-y-1 mb-12">
        <p className="text-secondary text-sm font-medium tracking-tight uppercase">Preferences</p>
        <h1 className="text-4xl font-bold tracking-tight">Targets</h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-12">
        <div className="apple-card p-10 bg-white/[0.01] border-white/[0.02] space-y-10">
          <div className="space-y-12">
            <div className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/60 px-1">Daily Energy Goal (kcal)</label>
              <input
                type="number"
                value={localTargets.calories}
                onChange={(e) => handleChange('calories', e.target.value)}
                className="text-7xl font-bold tracking-tighter bg-transparent outline-none w-full tabular-nums text-text-primary"
              />
              <div className="h-[1px] w-full bg-white/[0.03]" />
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/60 px-1">Protein Target (g)</label>
              <input
                type="number"
                value={localTargets.protein}
                onChange={(e) => handleChange('protein', e.target.value)}
                className="text-5xl font-bold tracking-tighter bg-transparent outline-none w-full tabular-nums text-text-primary/70"
              />
              <div className="h-[1px] w-full bg-white/[0.03]" />
            </div>

            <div className="grid grid-cols-2 gap-8">
               <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/60 px-1">Start Weight</label>
                  <input
                    type="number"
                    value={localTargets.startWeight}
                    onChange={(e) => handleChange('startWeight', e.target.value)}
                    className="text-4xl font-bold tracking-tighter bg-transparent outline-none w-full tabular-nums text-text-primary/70"
                  />
                  <div className="h-[1px] w-full bg-white/[0.03]" />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/60 px-1">Goal Weight</label>
                  <input
                    type="number"
                    value={localTargets.goalWeight}
                    onChange={(e) => handleChange('goalWeight', e.target.value)}
                    className="text-4xl font-bold tracking-tighter bg-transparent outline-none w-full tabular-nums text-text-primary/70"
                  />
                  <div className="h-[1px] w-full bg-white/[0.03]" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/60 px-1">Target Date (Optional)</label>
                  <input
                    type="date"
                    value={localTargets.targetWeightDate || ''}
                    onChange={(e) => handleChange('targetWeightDate', e.target.value)}
                    className="text-2xl font-bold tracking-tighter bg-transparent outline-none w-full tabular-nums text-text-primary/70 block"
                  />
                  <div className="h-[1px] w-full bg-white/[0.03]" />
                </div>
                <div className="space-y-4 text-right relative">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/60 px-1">Units</label>
                  <select 
                    value={localTargets.preferredUnits}
                    onChange={(e) => handleChange('preferredUnits', e.target.value)}
                    className="w-full text-2xl font-bold tracking-tighter bg-transparent outline-none text-text-primary/70 text-right appearance-none"
                  >
                    <option value="kg" className="bg-app-bg text-white">KG</option>
                    <option value="lb" className="bg-app-bg text-white">LB</option>
                  </select>
                  <div className="h-[1px] w-full bg-white/[0.03]" />
                </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-10 border-t border-white/[0.03]">
            <div className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/60 px-1">Reset Targets</label>
              <button
                type="button"
                onClick={handleReset}
                className="w-full h-14 rounded-2xl border border-white/[0.05] text-[10px] font-bold uppercase tracking-widest text-text-secondary hover:bg-white/[0.02] transition-all flex items-center justify-center gap-2"
                id="reset-targets-btn"
              >
                <RotateCcw size={14} />
                Defaults
              </button>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/60 px-1">Clear Data</label>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Permanently clear ALL weight and meal history?")) {
                    onClearAll();
                    onClearWeights();
                  }
                }}
                className="w-full h-14 rounded-2xl border border-white/[0.05] text-[10px] font-bold uppercase tracking-widest text-accent hover:bg-accent/5 transition-all flex items-center justify-center"
                id="factory-reset-btn"
              >
                Factory Reset
              </button>
            </div>
          </div>

          <div className="pt-6">
            <button
              type="submit"
              className={`w-full h-16 rounded-full font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl ${
                isSaved ? 'bg-accent/40 text-white shadow-accent/10' : 'bg-accent text-black shadow-accent/5'
              }`}
            >
              {isSaved ? (
                <>
                  <Check size={18} />
                  Settings Saved
                </>
              ) : (
                'Save Preferences'
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
