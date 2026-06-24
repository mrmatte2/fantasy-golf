import React, { useState } from 'react';
import { Trophy, Users, BarChart3, ArrowLeftRight, Scissors, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

function Section({ icon: Icon, title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card-dark">
      <button
        className="w-full flex items-center justify-between gap-3 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-masters-gold/15 border border-masters-gold/30 flex items-center justify-center shrink-0">
            <Icon size={16} className="text-masters-gold" />
          </div>
          <h2 className="font-display font-bold text-masters-cream text-lg">{title}</h2>
        </div>
        {open ? <ChevronUp size={16} className="text-white/30 shrink-0" /> : <ChevronDown size={16} className="text-white/30 shrink-0" />}
      </button>

      {open && <div className="mt-4 space-y-3 text-sm text-white/70 leading-relaxed">{children}</div>}
    </div>
  );
}

function Rule({ label, children }) {
  return (
    <div className="flex gap-3">
      <div className="w-1.5 h-1.5 rounded-full bg-masters-gold/60 mt-2 shrink-0" />
      <div>
        {label && <span className="text-masters-cream font-medium">{label}: </span>}
        {children}
      </div>
    </div>
  );
}

function Pill({ children, color = 'gold' }) {
  const cls = color === 'gold'
    ? 'bg-masters-gold/15 text-masters-gold border-masters-gold/30'
    : color === 'red'
    ? 'bg-red-900/30 text-red-400 border-red-800/40'
    : 'bg-white/8 text-white/60 border-white/15';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

export default function RulesPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-4 animate-fade-up">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-masters-cream">How to Play</h1>
        <p className="text-white/40 text-sm mt-1">Everything you need to know about Fantasy Golf</p>
      </div>

      {/* Overview */}
      <Section icon={Trophy} title="Overview">
        <p>
          Fantasy Golf is a pick-and-score game tied to real PGA Tour events. Before the tournament
          starts you draft a team of 9 players — your picks are shaped by a tier system based on world
          rankings, so you can't just stack the best players in the world. Over the four rounds of the
          tournament your team accumulates a score based on how your players perform on the course —
          the team with the lowest (best) total score at the end wins.
        </p>
        <p>
          Scoring follows real golf: under par is good, over par is bad. Your team score is the
          combined vs-par score of your best players each round.
        </p>
      </Section>

      {/* Draft */}
      <Section icon={Users} title="The Draft">
        <Rule label="Tier system">
          Players are divided into tiers based on world ranking. You can only pick a limited number
          from the elite tiers, forcing strategic trade-offs across your squad.
        </Rule>
        <Rule label="Tier limits">
          <span className="text-yellow-400 font-bold">S Tier</span> (Rank 1–3): pick 1 ·{' '}
          <span className="text-masters-gold font-bold">A Tier</span> (Rank 4–15): pick up to 2 ·{' '}
          <span className="text-blue-400 font-bold">B Tier</span> (Rank 16–40): pick up to 3 ·{' '}
          <span className="text-white/60 font-bold">C Tier</span> (Rank 41+): unlimited
        </Rule>
        <Rule label="Roster size">
          Pick exactly <span className="text-masters-cream font-medium">5 Starters</span> and{' '}
          <span className="text-masters-cream font-medium">4 Substitutes</span>. Tier limits apply
          across all 9 picks combined.
        </Rule>
        <Rule label="C-tier requirement">
          For Round 1 and Round 2 your starting lineup must include at least one C-tier player.
          This requirement is lifted from Round 3 onwards.
        </Rule>
        <Rule label="Substitution order">
          Your subs are ranked <Pill>S1</Pill> <Pill>S2</Pill> <Pill>S3</Pill> <Pill>S4</Pill>. The order matters —
          S1 is called up first if a starter misses the cut, so put your best backup at S1.
        </Rule>
        <Rule label="Roster lock">
          The draft closes automatically the moment the first Round 1 scores are recorded. After
          that you can only make changes through the substitution system.
        </Rule>
      </Section>

      {/* Scoring */}
      <Section icon={BarChart3} title="Scoring">
        <Rule label="Rounds 1 & 2 — Best 4 of 5">
          In the first two rounds, only your <span className="text-masters-cream font-medium">4 best-scoring starters</span> count.
          Your worst starter is dropped automatically, so one bad round from one player won't sink your team early.
        </Rule>
        <Rule label="Rounds 3 & 4 — All 5 count">
          From Round 3 onwards, <span className="text-masters-cream font-medium">all 5 starters count</span> toward
          your score — no player is dropped. This increases volatility and gives every starter a bigger impact on the weekend.
        </Rule>
        <Rule label="vs Par">
          Scores are measured relative to par (e.g. −3, E, +2). Lower is better. A player who
          shoots 68 on a par-72 course contributes −4 to your team that round.
        </Rule>
        <Rule label="Substitutes">
          Subs play and their scores are tracked, but they don't contribute to your team total while
          on the bench. They appear on the leaderboard card greyed out.
        </Rule>
        <Rule label="Total">
          Your overall tournament score is the sum of your round scores across all completed rounds. Lowest total wins.
        </Rule>
      </Section>

      {/* Substitutions */}
      <Section icon={ArrowLeftRight} title="Substitutions">
        <p>
          Between rounds you can swap players in and out of your starting lineup from the{' '}
          <span className="text-masters-cream font-medium">My Team</span> page. This is the main
          strategic lever available after the draft closes.
        </p>
        <Rule label="Window">
          Substitutions are open after each round ends and close automatically when the first scores
          of the next round are recorded. Make your changes before play resumes.
        </Rule>
        <Rule label="Roster snapshot">
          When a round begins, the system takes a snapshot of your lineup at that moment. That
          snapshot is what gets scored — late changes after the round starts do not apply to that
          round.
        </Rule>
        <Rule label="What you can do">
          Promote a sub into a starter slot, or move a starter to the bench. You can also reorder
          your substitutes to change who would be called up first in an auto-sub.
        </Rule>
      </Section>

      {/* Cut rule */}
      <Section icon={Scissors} title="The Cut">
        <p>
          After Round 2, the PGA Tour eliminates roughly half the field. Players who miss the cut
          do not play Rounds 3 or 4.
        </p>
        <Rule label="Cut badge">
          Players who miss the cut are marked <Pill color="red">CUT</Pill> throughout the app and
          are excluded from scoring from Round 3 onwards.
        </Rule>
        <Rule label="Manual substitution">
          If one of your starters misses the cut, the best move is to manually promote a surviving
          sub before Round 3 begins. You choose who comes in and in which slot.
        </Rule>
        <Rule label="Auto-sub">
          If you haven't manually resolved a cut starter by the time Round 3 scores first appear,
          the system auto-promotes your highest-priority surviving sub (S1 first, then S2, S3, S4)
          into that starter's slot. The sub order you set during the draft determines the priority.
        </Rule>
      </Section>

      {/* DQ */}
      <Section icon={AlertTriangle} title="DQ — Disqualified">
        <p>
          In rare cases a team may not be able to field a competitive lineup after the cut.
        </p>
        <Rule label="Trigger">
          Because all 5 starters count from Round 3 onwards, your team must field a full{' '}
          <span className="text-masters-cream font-medium">5 valid starters</span> for Round 3.
          If it cannot after all auto-subs have been applied, your team is marked{' '}
          <Pill color="red">DQ</Pill> and receives no score for Rounds 3 and 4.
        </Rule>
        <Rule label="How to avoid it">
          Draft at least 4 subs who are likely to make the cut, and set your sub order so the
          most reliable players are S1 and S2. If multiple starters are at risk, manually sub
          before Round 3 starts.
        </Rule>
      </Section>

      {/* Tips */}
      <div className="card-dark border-masters-gold/20 bg-masters-gold/5">
        <h2 className="font-display font-bold text-masters-gold mb-3">Strategy Tips</h2>
        <div className="space-y-2 text-sm text-white/70">
          <Rule>Don't overlook your C-tier picks — a well-chosen C-tier sub can outperform an A-tier starter on any given day, and they're often the ones who surprise you the most.</Rule>
          <Rule>Set your sub order carefully — S1 should be the sub you most want playing if a starter goes down.</Rule>
          <Rule>Watch the cut line during Round 2. If a starter is on the bubble, be ready to act before Round 3 begins.</Rule>
          <Rule>Subs still score every round even while on the bench. If a sub is outscoring your starters, promote them.</Rule>
        </div>
      </div>
    </div>
  );
}
