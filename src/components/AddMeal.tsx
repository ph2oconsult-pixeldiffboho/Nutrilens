/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Send, Loader2, X, Check, Trash2, ArrowRight, Camera, Image as ImageIcon } from 'lucide-react';
import { parseMealDescription, parseMealImage, GeminiResponse } from '../services/nutritionService';
import { FoodItem, MoodType, InputQuality } from '../types';
import { compressImage } from '../lib/imageUtils';

interface AddMealProps {
  onSave: (description: string, items: FoodItem[], mood?: MoodType, timestamp?: number) => void;
  onCancel: () => void;
}

export function AddMeal({ onSave, onCancel }: AddMealProps) {
  const [description, setDescription] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [stagedItems, setStagedItems] = useState<FoodItem[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedMood, setSelectedMood] = useState<MoodType | null>(null);
  const [refinementStep, setRefinementStep] = useState<{ itemIndex: number, question: string, options: string[] } | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [logTime, setLogTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  const handleParse = async (manualText?: string) => {
    const textToParse = manualText || description;
    if (!textToParse.trim()) return;
    setIsParsing(true);
    setError(null);
    try {
      const result = await parseMealDescription(textToParse);
      handleResult(result);
    } catch (err) {
      setError("I'm having trouble connecting, but I've made a rough estimate based on common patterns.");
    } finally {
      setIsParsing(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const originalBase64 = reader.result as string;
        try {
          const compressedBase64 = await compressImage(originalBase64);
          const result = await parseMealImage(compressedBase64);
          handleResult(result);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setIsParsing(false);
        }
      };
    } catch (err) {
      setError("Failed to process image. Try again or use text.");
      setIsParsing(false);
    }
  };

  const handleResult = (result: GeminiResponse) => {
    const avgConfidence = (result.items || []).reduce((acc: number, i: any) => acc + i.confidence, 0) / (result.items?.length || 1);
    
    if (result.is_fallback || avgConfidence < 0.3) {
      setError("I’ve made a rough estimate — you can refine this if needed.");
    }
    
    if (!result.items || result.items.length === 0) {
      setError("I couldn't quite understand that — try describing the meal again in more detail.");
      return;
    }
    
    const newItems = [...stagedItems, ...result.items];
    setStagedItems(newItems);
    setShowReview(true);
    setDescription(''); 
    
    if (result.input_quality === 'vague' && result.clarifying_question) {
      setRefinementStep({
        itemIndex: newItems.length - result.items.length,
        question: result.clarifying_question,
        options: result.clarifying_options
      });
    }

    if (result.input_quality === 'photo_estimate' && result.clarifying_question) {
       setRefinementStep({
        itemIndex: newItems.length - result.items.length,
        question: result.clarifying_question || "Is this a typical portion?",
        options: result.clarifying_options?.length ? result.clarifying_options : ["Small", "Medium", "Large"]
      });
    }
  };

  const handleToggleRecord = () => {
    if (isRecording) {
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError("Voice recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsRecording(true);
      setLiveTranscription('');
      setError(null);
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => (result as any)[0].transcript)
        .join('');
      
      setLiveTranscription(transcript);
      setDescription(transcript);
    };

    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => {
      setIsRecording(false);
      if (description.trim()) {
        handleParse();
      }
    };

    recognition.start();
  };

  const removeItem = (idx: number) => {
    const newItems = stagedItems.filter((_, i) => i !== idx);
    setStagedItems(newItems);
    if (newItems.length === 0) setShowReview(false);
  };

  const refineItem = (index: number, multiplier: number) => {
    const items = [...stagedItems];
    const item = items[index];
    
    items[index] = {
      ...item,
      nutrients: {
        ...item.nutrients,
        calories: {
          precise: Math.round(item.nutrients.calories.precise * multiplier),
          min: Math.round(item.nutrients.calories.min * multiplier),
          max: Math.round(item.nutrients.calories.max * multiplier),
        },
      },
      inputQuality: 'partial',
    };
    setStagedItems(items);
    setRefinementStep(null);
  };

  const totalCals = stagedItems.reduce((sum, item) => sum + item.nutrients.calories.precise, 0) || 0;

  return (
    <div className="min-h-screen bg-app-bg text-white pb-32">
      <header className="px-6 pt-12 pb-6 flex justify-between items-center bg-app-bg/80 backdrop-blur-xl sticky top-0 z-50">
        <h1 className="text-[10px] font-bold uppercase text-secondary tracking-[0.2em]">
          Log Experience
        </h1>
        <button onClick={onCancel} className="p-2 text-white/40 hover:text-white transition-colors">
          <X size={24} />
        </button>
      </header>

      <div className="px-6 space-y-12">
        <AnimatePresence mode="wait">
          {!showReview ? (
            <motion.div
              key="input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-12"
            >
              {stagedItems.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-secondary text-[10px] font-bold uppercase tracking-widest px-1">Current Meal Parts</h3>
                  <div className="space-y-2">
                    {stagedItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl">
                        <span className="font-bold text-sm">{item.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-accent font-bold text-xs">{Math.round(item.nutrients.calories.precise)} kcal</span>
                          <button onClick={() => removeItem(idx)} className="text-white/20 hover:text-accent transition-colors"><X size={16} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-8 flex flex-col items-center">
                <div className="flex items-center gap-8">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleToggleRecord}
                      className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all ${
                        isRecording 
                          ? 'bg-accent shadow-[0_0_40px_rgba(212,163,115,0.2)]' 
                          : 'bg-white/[0.03] border border-white/[0.05]'
                      }`}
                    >
                      {isRecording && (
                        <motion.div 
                          layoutId="pulse"
                          className="absolute inset-0 bg-accent rounded-full opacity-20"
                          animate={{ scale: [1, 1.4, 1] }}
                          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        />
                      )}
                      <Mic size={28} className={`relative z-10 ${isRecording ? 'text-black' : 'text-accent/60'}`} />
                      <span className="absolute -bottom-8 text-[10px] uppercase font-bold text-secondary">Voice</span>
                    </motion.button>

                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="relative w-24 h-24 rounded-full bg-white/[0.03] border border-white/[0.05] flex items-center justify-center text-accent/60"
                      >
                        <Camera size={28} />
                        <span className="absolute -bottom-8 text-[10px] uppercase font-bold text-secondary">Photo</span>
                      </motion.div>
                    </label>

                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        const el = document.getElementById('description-input');
                        el?.focus();
                      }}
                      className="relative w-24 h-24 rounded-full bg-white/[0.03] border border-white/[0.05] flex items-center justify-center text-accent/60"
                    >
                      <ImageIcon size={28} className="opacity-0 absolute" /> {/* placeholder to keep size consistent if needed, but using text icon */}
                      <Send size={28} className="rotate-[340deg] translate-x-0.5" />
                      <span className="absolute -bottom-8 text-[10px] uppercase font-bold text-secondary">Text</span>
                    </motion.button>
                </div>

                <div className="text-center space-y-1 pt-6">
                  <p className="text-xl font-bold tracking-tight text-text-primary">
                    {isRecording ? "Listening..." : isParsing ? "Analysing meal..." : stagedItems.length > 0 ? "Add another part" : "Estimate your meal"}
                  </p>
                  <p className="text-sm text-text-secondary h-6 italic text-center font-medium">
                    {isParsing ? (isRecording ? "Transcribing..." : "AI identifying likely foods...") : liveTranscription || (isRecording ? "" : "Choose an input method")}
                  </p>
                </div>
              </div>

              <div className="apple-card p-10 bg-white/[0.01] border-white/[0.02] space-y-4">
                <textarea
                  id="description-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your meal..."
                  className="w-full min-h-[120px] bg-transparent text-xl font-medium outline-none placeholder:text-white/5 transition-all resize-none leading-tight text-text-primary"
                />
                
                <div className="flex justify-end pt-4 gap-4">
                   {stagedItems.length > 0 && (
                      <button
                        onClick={() => setShowReview(true)}
                        className="h-14 px-8 rounded-full border border-white/[0.05] font-bold text-secondary text-sm hover:bg-white/[0.02]"
                      >
                        Finish & Review
                      </button>
                   )}
                   <button
                    disabled={!description.trim() || isParsing}
                    onClick={() => handleParse()}
                    className="h-14 w-14 rounded-full bg-accent/10 border border-accent/20 text-accent flex items-center justify-center disabled:opacity-5 transition-all hover:bg-accent/20 active:scale-95"
                  >
                    {isParsing ? <Loader2 size={24} className="animate-spin" /> : <ArrowRight size={24} />}
                  </button>
                </div>
                {error && <p className="text-accent/60 text-sm font-medium text-center">{error}</p>}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="flex items-end justify-between px-1">
                <div className="space-y-1">
                  <h2 className="text-secondary text-[10px] font-bold uppercase tracking-widest">Estimated total</h2>
                  <p className="text-5xl font-bold tracking-tighter tabular-nums text-text-primary">{Math.round(totalCals)} <span className="text-xl font-medium text-secondary">kcal</span></p>
                </div>
              </div>

              <div className="space-y-4">
                {stagedItems.map((item, idx) => (
                  <div key={idx} className="apple-card p-6 bg-white/[0.01] border-white/[0.02] space-y-6">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="font-bold text-2xl tracking-tight leading-none text-text-primary/90">{item.name}</p>
                        <p className="text-secondary text-xs font-medium italic">{item.servingSize}</p>
                        {item.uncertaintyReason && (
                          <p className="text-accent/60 text-[10px] font-medium leading-tight pt-1 italic">
                            “{item.uncertaintyReason}”
                          </p>
                        )}
                      </div>
                      <button onClick={() => removeItem(idx)} className="p-2 text-white/5 hover:text-accent transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-8 pt-6 border-t border-white/[0.03]">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Energy</p>
                        <div className="flex flex-col">
                          <p className="text-2xl font-bold tabular-nums tracking-tight text-text-primary">
                            {Math.round(item.nutrients.calories.precise)}
                            <span className="text-xs font-medium text-secondary ml-1">kcal</span>
                          </p>
                          {item.nutrients.calories.max - item.nutrients.calories.min > 50 && (
                            <p className="text-secondary text-[10px] tabular-nums font-medium">
                              ({Math.round(item.nutrients.calories.min)}–{Math.round(item.nutrients.calories.max)})
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Protein</p>
                        <p className="text-2xl font-bold tabular-nums tracking-tight text-text-primary">
                          {Math.round(item.nutrients.protein.precise)}
                          <span className="text-xs font-medium text-secondary ml-1">g</span>
                        </p>
                      </div>
                    </div>

                    <AnimatePresence>
                      {refinementStep?.itemIndex === idx && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="pt-6 border-t border-white/[0.03] space-y-4 overflow-hidden"
                        >
                          <p className="text-sm font-bold text-text-primary/80 italic tracking-tight">This could vary — quick check?</p>
                          <p className="text-secondary text-[10px] uppercase font-bold tracking-widest">{refinementStep.question}</p>
                          <div className="grid grid-cols-3 gap-3">
                            <button onClick={() => refineItem(idx, 0.7)} className="h-12 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-accent/10 hover:text-accent transition-all text-text-secondary">Small</button>
                            <button onClick={() => refineItem(idx, 1.0)} className="h-12 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-accent/10 hover:text-accent transition-all text-text-secondary">Medium</button>
                            <button onClick={() => refineItem(idx, 1.4)} className="h-12 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-accent/10 hover:text-accent transition-all text-text-secondary">Large</button>
                          </div>

                          <div className="pt-4 space-y-2">
                             <p className="text-secondary text-[10px] font-bold uppercase tracking-widest">Adjust by Weight</p>
                             <div className="grid grid-cols-4 gap-2">
                               {[100, 150, 200, 300].map(w => (
                                 <button key={w} onClick={() => refineItem(idx, w/150)} className="h-10 rounded-xl bg-white/[0.02] border border-white/[0.05] text-[10px] font-bold text-text-secondary hover:bg-accent/10 hover:text-accent transition-all">{w}g</button>
                               ))}
                             </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <h3 className="text-secondary text-[10px] font-bold uppercase tracking-widest px-1">How do you feel?</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {(['Energised', 'Good', 'Tired', 'Hungry', 'Bloated', 'Stressed'] as MoodType[]).slice(0, 4).map(mood => (
                          <button
                            key={mood}
                            onClick={() => setSelectedMood(selectedMood === mood ? null : mood)}
                            className={`h-11 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                              selectedMood === mood 
                                ? 'bg-accent/10 text-accent border border-accent/20 shadow-[0_0_20px_rgba(212,163,115,0.1)]' 
                                : 'bg-white/[0.02] text-text-secondary border border-white/[0.02] hover:bg-white/[0.04]'
                            }`}
                          >
                            {mood}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-secondary text-[10px] font-bold uppercase tracking-widest px-1">Log Time</h3>
                      <div className="apple-card bg-white/[0.02] border-white/[0.05] p-3 flex items-center justify-center h-24">
                        <input 
                          type="time" 
                          value={logTime}
                          onChange={(e) => setLogTime(e.target.value)}
                          className="bg-transparent text-3xl font-bold tracking-tight text-text-primary outline-none text-center tabular-nums"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-8">
                    <button
                      onClick={() => {
                        setShowReview(false);
                        setRefinementStep(null);
                      }}
                      className="h-14 rounded-full border border-white/[0.05] font-bold hover:bg-white/[0.02] transition-all text-secondary text-sm"
                    >
                      Add More
                    </button>
                    <button
                      onClick={() => {
                        const [hours, minutes] = logTime.split(':').map(Number);
                        const date = new Date();
                        date.setHours(hours, minutes, 0, 0);
                        onSave(
                          `Meal: ${stagedItems.map(i => i.name).join(', ')}`, 
                          stagedItems, 
                          selectedMood || undefined,
                          date.getTime()
                        );
                      }}
                      className="h-14 rounded-full bg-accent text-black font-bold flex items-center justify-center gap-2 hover:bg-accent/90 active:scale-95 transition-all shadow-xl shadow-accent/5"
                    >
                      <Check size={20} />
                      Log
                    </button>
                  </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
