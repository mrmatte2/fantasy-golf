import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWhatsNew } from '../../hooks/useWhatsNew';
import { CHANGELOG } from '../../data/changelog';

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

const RECENT_DATES = 2;

export default function WhatsNewModal() {
  const { open, dismiss } = useWhatsNew();
  if (!open) return null;

  const recentReleases = CHANGELOG
    .map(release => ({
      ...release,
      entries: release.entries.filter(e => e.public),
    }))
    .filter(r => r.entries.length > 0)
    .slice(0, RECENT_DATES);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={dismiss}>
      <div className="relative w-full max-w-md bg-masters-dark border border-white/10 rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10">
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
        <div className="relative">
          <div className="px-6 py-5 space-y-6 overflow-y-auto max-h-[55vh]">
            {recentReleases.map(release => (
              <div key={release.date}>
                <div className="text-xs font-medium text-masters-gold/60 uppercase tracking-widest mb-3">
                  {formatDate(release.date)}
                </div>
                <div className="space-y-4">
                  {release.entries.map((entry, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="mt-1 w-1.5 h-1.5 rounded-full bg-masters-gold shrink-0" />
                      <div>
                        <div className="text-masters-cream text-sm font-medium">{entry.label}</div>
                        {entry.text.split('\n\n').map((para, j) => (
                          <p key={j} className="text-white/50 text-xs mt-0.5 leading-relaxed">{para}</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-masters-dark to-transparent" />
        </div>

        {/* Footer — always visible */}
        <div className="px-6 pb-6 pt-2 space-y-2">
          <button onClick={dismiss} className="w-full btn-primary py-2.5 text-sm">
            Got it
          </button>
          <Link to="/changelog" onClick={dismiss}
            className="block text-center text-xs text-white/30 hover:text-white/60 transition-colors py-1">
            See full history →
          </Link>
        </div>
      </div>
    </div>
  );
}
