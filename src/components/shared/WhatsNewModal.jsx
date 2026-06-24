import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { useWhatsNew } from '../../hooks/useWhatsNew';
import { CHANGELOG } from '../../data/changelog';

export default function WhatsNewModal() {
  const { open, dismiss } = useWhatsNew();
  if (!open) return null;

  const publicEntries = CHANGELOG.flatMap(release =>
    release.entries
      .filter(e => e.public)
      .map(e => ({ ...e, date: release.date }))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={dismiss}>
      <div className="relative w-full max-w-md bg-masters-dark border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles size={18} className="text-masters-gold" />
            <span className="font-display font-bold text-masters-cream text-lg">What's New</span>
          </div>
          <button onClick={dismiss}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Entries — scrollable with fade hint */}
        <div className="relative min-h-0 flex-1">
          <div className="px-6 py-5 space-y-4 overflow-y-auto h-full">
            {publicEntries.map((entry, i) => (
              <div key={i} className="flex gap-3">
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-masters-gold shrink-0" />
                <div>
                  <div className="text-masters-cream text-sm font-medium">{entry.label}</div>
                  <div className="text-white/50 text-xs mt-0.5 leading-relaxed">{entry.text}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-masters-dark to-transparent" />
        </div>

        {/* Footer — always visible */}
        <div className="px-6 pb-6 pt-2 shrink-0">
          <button onClick={dismiss}
            className="w-full btn-primary py-2.5 text-sm">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
