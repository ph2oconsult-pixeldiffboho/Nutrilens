/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import { LayoutGrid, Plus, History, Settings } from 'lucide-react';
import { View } from '../types';

interface NavigationProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

export function Navigation({ currentView, onNavigate }: NavigationProps) {
  const items = [
    { id: 'dashboard' as View, icon: LayoutGrid, label: 'Now' },
    { id: 'add-meal' as View, icon: Plus, label: 'Add' },
    { id: 'trends' as View, icon: History, label: 'Trends' },
    { id: 'settings' as View, icon: Settings, label: 'Set' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[60] safe-area-bottom pb-6 pt-4 px-6 flex justify-center pointer-events-none">
      <div className="glass-pill h-14 w-full max-w-xs flex items-center justify-around px-4 pointer-events-auto bg-black/20 backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.4)] border-white/[0.02]">
        {items.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            id={`nav-${id}`}
            onClick={() => onNavigate(id)}
            className={`relative flex flex-col items-center justify-center w-10 h-10 transition-all duration-300 ${
              currentView === id ? 'text-accent' : 'text-text-secondary/40 hover:text-text-secondary/60'
            }`}
          >
            {currentView === id && (
              <motion.div
                layoutId="nav-active-bubble"
                className="absolute inset-0 bg-accent/[0.03] rounded-xl"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            <Icon size={18} className={currentView === id ? 'scale-105 transition-transform' : ''} />
          </button>
        ))}
      </div>
    </nav>
  );
}
