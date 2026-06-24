import React from 'react';
import { Sparkles } from 'lucide-react';
import { CHANGELOG } from '../data/changelog';

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function ChangelogPage() {
  const publicReleases = CHANGELOG.map(release => ({
    ...release,
    entries: release.entries.filter(e => e.public),
  })).filter(r => r.entries.length > 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 animate-fade-up">
      <div className="flex items-center gap-3 mb-8">
        <Sparkles size={20} className="text-masters-gold" />
        <div>
          <h1 className="font-display text-3xl font-bold text-masters-cream">Version History</h1>
          <p className="text-white/40 text-sm mt-0.5">All updates to Fantasy Golf</p>
        </div>
      </div>

      <div className="space-y-8">
        {publicReleases.map(release => (
          <div key={release.date}>
            <div className="text-xs font-medium text-masters-gold/70 uppercase tracking-widest mb-3">
              {formatDate(release.date)}
            </div>
            <div className="card-dark space-y-4">
              {release.entries.map((entry, i) => (
                <div key={i} className="flex gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-masters-gold/60 shrink-0" />
                  <div>
                    <div className="text-masters-cream text-sm font-medium">{entry.label}</div>
                    {entry.text.split('\n\n').map((para, j) => (
                      <p key={j} className="text-white/50 text-xs mt-1 leading-relaxed">{para}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
