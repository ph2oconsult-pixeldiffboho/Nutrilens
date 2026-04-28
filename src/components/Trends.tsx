/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WeightEntry, MoodEntry, NutritionTargets, MoodType } from '../types';
import { Mic, Info } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ScatterChart, Scatter, ZAxis } from 'recharts';

interface TrendsProps {
  weightEntries: WeightEntry[];
  weightTrend: number;
  moodEntries: MoodEntry[];
  moodInsights: string[];
  targets: NutritionTargets;
  onAddWeight: (weight: number) => void;
  onAddMood: (mood: MoodType) => void;
}

export function Trends({ 
  weightEntries, 
  weightTrend, 
  moodEntries, 
  moodInsights, 
  targets,
  onAddWeight,
  onAddMood
}: TrendsProps) {
  const [weightInput, setWeightInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedWeights = useMemo(() => {
    return [...weightEntries].sort((a, b) => a.timestamp - b.timestamp);
  }, [weightEntries]);

  // Calculate 7-day rolling average for the chart
  const chartData = useMemo(() => {
    if (sortedWeights.length === 0) return [];
    
    return sortedWeights.map((entry, idx) => {
      const window = sortedWeights.slice(Math.max(0, idx - 6), idx + 1);
      const avg = window.reduce((sum, e) => sum + e.weight, 0) / window.length;
      return {
        date: new Date(entry.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        timestamp: entry.timestamp,
        weight: entry.weight,
        trend: Math.round(avg * 10) / 10
      };
    });
  }, [sortedWeights]);

  const currentWeight = sortedWeights.length > 0 ? sortedWeights[sortedWeights.length - 1].weight : 0;
  
  const trendEstimate = useMemo(() => {
    if (weightEntries.length < 7) return null;
    
    const recent = sortedWeights.slice(-7);
    const firstWeight = recent[0].weight;
    const lastWeight = recent[recent.length - 1].weight;
    const diff = firstWeight - lastWeight; // positive if losing
    
    if (Math.abs(diff) < 0.1) return "stable";
    
    const targetDiff = Math.abs(currentWeight - targets.goalWeight);
    if (targetDiff < 0.5) return "near target";

    // Rate of change per week (roughly based on these 7 entries)
    const ratePerWeek = diff; // This is simplistic but fits the "minimal" requirement
    
    if (ratePerWeek <= 0) return "stable";

    const weeksToTarget = Math.ceil(targetDiff / ratePerWeek);
    return weeksToTarget;
  }, [weightEntries, targets.goalWeight, currentWeight]);

  const insightLine = useMemo(() => {
    if (weightEntries.length < 2) return "Continue logging to see your direction.";
    
    const last = weightEntries[0]?.weight;
    const prev = weightEntries[1]?.weight;
    
    if (Math.abs(weightTrend - targets.goalWeight) < 0.5) {
      return "You are maintaining your target region.";
    }

    if (weightTrend < targets.goalWeight) {
      return "The trend is gradually moving toward your target.";
    }

    return "Daily variations are normal — the trend line shows your actual direction.";
  }, [weightEntries, weightTrend, targets.goalWeight]);

  const handleWeightSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const weight = parseFloat(weightInput);
    if (!isNaN(weight)) {
      onAddWeight(weight);
      setWeightInput('');
      setError(null);
    } else {
      setError("Please enter a numeric value");
    }
  };

  const handleToggleRecord = () => {
    if (isRecording) {
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError("Voice not supported");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsRecording(true);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => (result as any)[0].transcript)
        .join('');
      
      const numberMatch = transcript.match(/\d+(\.\d+)?/);
      if (numberMatch) {
         setWeightInput(numberMatch[0]);
      }
    };

    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    
    recognition.start();
  };

  return (
    <div className="pb-40 px-6 pt-12 space-y-12">
      <header className="space-y-1">
        <p className="text-secondary text-sm font-medium tracking-tight uppercase">Analysis</p>
        <h1 className="text-4xl font-bold tracking-tight">Trends</h1>
      </header>

      {/* Primary Trend Card */}
      <section className="space-y-6">
        <div className="apple-card p-10 space-y-10 bg-white/[0.01] border-white/[0.02]">
          <div className="flex justify-between items-start">
             <div className="space-y-1">
                <p className="text-secondary text-[10px] font-bold uppercase tracking-widest">Current</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-6xl font-bold tracking-tighter tabular-nums text-text-primary">
                    {currentWeight || "—"}
                  </p>
                  <p className="text-secondary text-sm">{targets.preferredUnits}</p>
                </div>
             </div>
             <div className="space-y-1 text-right">
                <p className="text-secondary text-[10px] font-bold uppercase tracking-widest">7-Day Trend</p>
                <p className="text-2xl font-bold tracking-tight text-white/40 tabular-nums">
                  {currentWeight ? weightTrend.toFixed(1) : "—"}
                </p>
             </div>
          </div>

          {/* Minimal Chart Area */}
          <div className="h-[240px] w-full -mx-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis 
                  dataKey="date" 
                  hide={false} 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#888', dy: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  hide 
                  domain={['dataMin - 2', 'dataMax + 2']} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111', border: 'none', borderRadius: '16px', fontSize: '12px' }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: '#888', marginBottom: '4px' }}
                  cursor={{ stroke: '#333' }}
                />
                <ReferenceLine 
                  y={targets.goalWeight} 
                  stroke="#ffffff" 
                  strokeOpacity={0.05} 
                  strokeDasharray="4 4" 
                />
                {/* Subtle daily points */}
                <Line 
                  type="monotone" 
                  dataKey="weight" 
                  stroke="none" 
                  dot={{ r: 2, fill: '#ffffff', fillOpacity: 0.1 }}
                  activeDot={false}
                />
                {/* Primary Trend Line */}
                <Line 
                  type="monotone" 
                  dataKey="trend" 
                  stroke="#F59E0B" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: '#F59E0B' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Neutral Progress Footer */}
          <div className="pt-10 border-t border-white/[0.03] space-y-4">
             <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2 text-secondary">
                   <span>Target:</span>
                   <span className="text-text-primary font-bold">{targets.goalWeight} {targets.preferredUnits}</span>
                   {targets.targetWeightDate && (
                      <span className="text-xs opacity-50">by {new Date(targets.targetWeightDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                   )}
                </div>
                {typeof trendEstimate === 'number' && (
                   <div className="text-secondary">
                      At current trend: <span className="text-text-primary font-bold">~{trendEstimate} weeks</span>
                   </div>
                )}
                {trendEstimate === null && weightEntries.length > 0 && (
                   <span className="text-[10px] uppercase font-bold tracking-widest text-secondary/30">Calculating trend...</span>
                )}
             </div>
             <div className="flex items-start gap-4">
               <div className="mt-1">
                 <Info size={16} className="text-white/5" />
               </div>
               <p className="text-xl font-medium leading-tight text-text-primary/70 italic tracking-tight">
                 {insightLine}
               </p>
             </div>
          </div>
        </div>

        {/* Lightweight Log Input */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
             <h3 className="text-[10px] font-bold uppercase tracking-widest text-secondary">Log Weight</h3>
             {error && <span className="text-[10px] text-accent font-bold uppercase">{error}</span>}
          </div>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <input
                type="number"
                step="0.1"
                placeholder={isRecording ? "Listening..." : "Today's weight"}
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.05] rounded-full px-8 h-18 text-xl font-bold outline-none focus:bg-white/[0.06] transition-all placeholder:text-white/5 text-text-primary"
              />
              <button
                onClick={handleToggleRecord}
                className={`absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full transition-all ${isRecording ? 'bg-accent text-black scale-110' : 'bg-white/5 text-secondary hover:text-white'}`}
              >
                <Mic size={20} />
              </button>
            </div>
            <button 
              onClick={() => handleWeightSubmit()}
              disabled={!weightInput}
              className="px-10 rounded-full bg-accent text-black font-bold h-18 hover:bg-accent/90 active:scale-95 transition-all shadow-xl shadow-accent/5 disabled:opacity-50 disabled:grayscale"
            >
              Log
            </button>
          </div>
        </div>
      </section>

      {/* Mood Insights - Keeping it subtle */}
      <section className="space-y-6">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-secondary">Biological Insights</h2>
        </div>
        <div className="space-y-3">
          {moodInsights.length > 0 ? (
            moodInsights.map((insight, i) => (
              <div key={i} className="p-8 rounded-[40px] bg-white/[0.01] border border-white/[0.02] text-xl font-medium leading-tight italic text-text-primary/70 tracking-tight">
                {insight}
              </div>
            ))
          ) : (
            <div className="apple-card p-12 border-dashed border-white/10 bg-transparent flex flex-col items-center justify-center space-y-2 opacity-50">
              <p className="text-secondary font-medium italic">Patterns will appear as you log biological feedback.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
