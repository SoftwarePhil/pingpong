'use client';

import { useState } from 'react';
import { Match } from '../../../types/pingpong';

// ── Layout constants ─────────────────────────────────────────────────────────
const CARD_W = 240;  // match card width (px)
const CARD_H = 76;   // match card height — fixed so SVG lines stay aligned
const R1_GAP = 32;   // vertical gap between cards in round 1
const COL_GAP = 80;  // horizontal gap between round columns

/** Calculate absolute {x, y} for match `mIdx` (0-based) in round column `rIdx` (0-based main-bracket index). */
function getPos(rIdx: number, mIdx: number, r1Count: number, hasPlayIn: boolean) {
  const unitH = CARD_H + R1_GAP;
  const groupSize = Math.pow(2, rIdx);
  const y = mIdx * groupSize * unitH + (groupSize * unitH - CARD_H) / 2;
  const xOffset = hasPlayIn ? CARD_W + COL_GAP : 0;
  const x = xOffset + rIdx * (CARD_W + COL_GAP);
  return { x, y };
}

interface BracketViewProps {
  bracketMatches: Match[];
  getPlayerName: (id: string) => string;
  onAddGame: (match: Match, score1: number, score2: number) => Promise<void>;
  onSaveGameEdit: (gameId: string, score1: number, score2: number) => Promise<void>;
  readOnly?: boolean;
}

export default function BracketView({ bracketMatches, getPlayerName, onAddGame, onSaveGameEdit, readOnly = false }: BracketViewProps) {
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [score1, setScore1] = useState('');
  const [score2, setScore2] = useState('');
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editG1, setEditG1] = useState('');
  const [editG2, setEditG2] = useState('');

  const playInMatches = bracketMatches.filter(m => (m.bracketRound ?? 0) === 0);
  const mainMatches   = bracketMatches.filter(m => (m.bracketRound ?? 0) > 0);
  const mainRounds    = [...new Set(mainMatches.map(m => m.bracketRound!))].sort((a, b) => a - b);
  const hasPlayIn     = playInMatches.length > 0;

  if (mainRounds.length === 0 && !hasPlayIn) {
    return <div className="text-center py-16 text-zinc-500 text-sm">No bracket matches yet.</div>;
  }

  const r1Matches = mainMatches.filter(m => m.bracketRound === mainRounds[0]);
  const r1Count   = r1Matches.length;
  const unitH     = CARD_H + R1_GAP;
  const totalH    = Math.max(r1Count * unitH, CARD_H + 40);
  const xOffset   = hasPlayIn ? CARD_W + COL_GAP : 0;
  const totalW    = xOffset + mainRounds.length * (CARD_W + COL_GAP) - COL_GAP + 2;

  // ── SVG connector paths ───────────────────────────────────────────────────
  const connectors: { d: string; key: string }[] = [];

  // Play-in → the R1 match containing PLAY_IN_WINNER
  if (hasPlayIn) {
    const r1TargetIdx = r1Matches.findIndex(
      m => m.player1Id === 'PLAY_IN_WINNER' || m.player2Id === 'PLAY_IN_WINNER'
    );
    if (r1TargetIdx !== -1) {
      const targetPos = getPos(0, r1TargetIdx, r1Count, hasPlayIn);
      const cy = targetPos.y + CARD_H / 2;
      connectors.push({ key: 'playin', d: `M ${CARD_W} ${cy} H ${targetPos.x}` });
    }
  }

  // Main bracket: pairs in round r feed into round r+1
  for (let r = 0; r < mainRounds.length - 1; r++) {
    const rMatches = mainMatches.filter(m => m.bracketRound === mainRounds[r]);
    for (let i = 0; i < Math.floor(rMatches.length / 2); i++) {
      const topPos  = getPos(r, i * 2,     r1Count, hasPlayIn);
      const botPos  = getPos(r, i * 2 + 1, r1Count, hasPlayIn);
      const nextPos = getPos(r + 1, i,     r1Count, hasPlayIn);

      const x1   = topPos.x + CARD_W;
      const y1   = topPos.y + CARD_H / 2;
      const x2   = botPos.x + CARD_W;
      const y2   = botPos.y + CARD_H / 2;
      const midX = x1 + COL_GAP / 2;
      const midY = (y1 + y2) / 2;
      const dx   = nextPos.x;

      // ┤ shape: two horizontals + vertical + feed line
      connectors.push({
        key: `r${r}-${i}`,
        d: [
          `M ${x1} ${y1} H ${midX}`,   // top horizontal
          `M ${x2} ${y2} H ${midX}`,   // bottom horizontal
          `M ${midX} ${y1} V ${y2}`,   // vertical bridge
          `M ${midX} ${midY} H ${dx}`, // feed to next round
        ].join(' '),
      });
    }
  }

  // ── Active match score entry ───────────────────────────────────────────────
  const activeMatch = activeMatchId ? bracketMatches.find(m => m.id === activeMatchId) : null;

  const handleRecord = async () => {
    if (!activeMatch) return;
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    //DO NOT CHANGE THIS BLOCK OF CODE
    const maxScore = Math.max(s1, s2);
    const minScore = Math.min(s1, s2);
    const scoreDifference = maxScore - minScore;
    //DO NOT CHANGE THIS BLOCK OF CODE
    if (isNaN(s1) || isNaN(s2)) { alert('Enter valid scores'); return; }
    if (maxScore < 11) { alert('Game must reach 11 points to be complete'); return; }
    if (maxScore > 11 && scoreDifference !== 2) { alert('Game must be won by 2 points'); return; }
    await onAddGame(activeMatch, s1, s2);
    setScore1('');
    setScore2('');
  };

  const getRoundLabel = (rNum: number) => {
    const count = mainMatches.filter(m => m.bracketRound === rNum).length;
    if (count === 1) return '🏆 Final';
    if (count === 2) return 'Semifinal';
    if (count === 4) return 'Quarterfinal';
    return `Round ${rNum}`;
  };

  return (
    <div className="space-y-4">
      {/* Winner callout — only when the highest round has exactly 1 match (the real final) */}
      {(() => {
        const finalRound = mainRounds[mainRounds.length - 1];
        const finalRoundMatches = mainMatches.filter(m => m.bracketRound === finalRound);
        if (finalRoundMatches.length !== 1) return null;
        const finalMatch = finalRoundMatches.find(m => m.winnerId);
        if (!finalMatch) return null;
        return (
          <div className="flex items-center justify-center gap-3 bg-amber-950 border border-amber-700 rounded-xl py-5">
            <span className="text-4xl">🏆</span>
            <div>
              <p className="text-xs font-bold text-amber-500 uppercase tracking-widest">Tournament Champion</p>
              <p className="text-2xl font-black text-amber-300">{getPlayerName(finalMatch.winnerId!)}</p>
            </div>
          </div>
        );
      })()}

      {/* Column labels */}
      <div className="flex" style={{ gap: 0 }}>
        {hasPlayIn && (
          <div style={{ width: CARD_W + COL_GAP, flexShrink: 0 }}>
            <p className="text-center text-xs font-bold text-gray-400 uppercase tracking-widest">Play-in</p>
          </div>
        )}
        {mainRounds.map(rNum => (
          <div key={rNum} style={{ width: CARD_W + COL_GAP, flexShrink: 0 }}>
            <p className={`text-center text-xs font-bold uppercase tracking-widest ${mainMatches.filter(m => m.bracketRound === rNum).length === 1 ? 'text-amber-500' : 'text-zinc-500'}`}>
              {getRoundLabel(rNum)}
            </p>
          </div>
        ))}
      </div>

      {/* Bracket canvas */}
      <div className="overflow-x-auto">
        <div style={{ position: 'relative', width: totalW, height: totalH }}>
          {/* SVG connector lines */}
          <svg
            style={{ position: 'absolute', inset: 0, width: totalW, height: totalH, overflow: 'visible' }}
            className="pointer-events-none"
            aria-hidden
          >
            {connectors.map(({ d, key }) => (
              <path key={key} d={d} fill="none" stroke="#3f3f46" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </svg>

          {/* Play-in matches */}
          {hasPlayIn && playInMatches.map(match => {
            const r1TargetIdx = r1Matches.findIndex(m => m.player1Id === 'PLAY_IN_WINNER' || m.player2Id === 'PLAY_IN_WINNER');
            const yPos = r1TargetIdx !== -1 ? getPos(0, r1TargetIdx, r1Count, hasPlayIn).y : 0;
            return (
              <div key={match.id} style={{ position: 'absolute', left: 0, top: yPos, width: CARD_W }}>
                <BracketCard
                  match={match}
                  getPlayerName={getPlayerName}
                  isActive={activeMatchId === match.id}
                  onSelect={() => setActiveMatchId(prev => prev === match.id ? null : match.id)}
                  readOnly={readOnly}
                />
              </div>
            );
          })}

          {/* Main bracket matches */}
          {mainRounds.map((rNum, rIdx) => {
            const roundMatches = mainMatches.filter(m => m.bracketRound === rNum);
            const isFinalRound = mainMatches.filter(m => m.bracketRound === rNum).length === 1;
            return roundMatches.map((match, mIdx) => {
              const { x, y } = getPos(rIdx, mIdx, r1Count, hasPlayIn);
              return (
                <div key={match.id} style={{ position: 'absolute', left: x, top: y, width: CARD_W }}>
                  <BracketCard
                    match={match}
                    getPlayerName={getPlayerName}
                    isActive={activeMatchId === match.id}
                    onSelect={() => setActiveMatchId(prev => prev === match.id ? null : match.id)}
                    isFinal={isFinalRound}
                    readOnly={readOnly}
                  />
                </div>
              );
            });
          })}
        </div>
      </div>

      {/* Score entry panel — appears below the bracket when a match is selected */}
      {activeMatch && !readOnly && !activeMatch.winnerId && activeMatch.player2Id !== 'BYE' && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-xs font-semibold text-emerald-500 uppercase tracking-widest mb-0.5">Recording game</p>
              <h4 className="font-bold text-white text-base">
                {getPlayerName(activeMatch.player1Id)}
                <span className="text-zinc-600 mx-2">vs</span>
                {getPlayerName(activeMatch.player2Id)}
              </h4>
            </div>
            <button onClick={() => { setActiveMatchId(null); setScore1(''); setScore2(''); }}
              className="text-zinc-600 hover:text-zinc-300 text-xl font-bold leading-none">✕</button>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-zinc-400 font-medium mb-1.5">
                {getPlayerName(activeMatch.player1Id)}
              </label>
              <input
                type="number" min="0" max="50" value={score1}
                onChange={e => setScore1(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRecord()}
                className="w-full border border-zinc-600 rounded-xl px-3 py-3 text-2xl font-bold text-center text-white bg-zinc-800 focus:border-emerald-500 focus:outline-none transition-colors"
                placeholder="0"
              />
            </div>

            <div className="pb-3 text-2xl text-zinc-700 font-bold select-none">—</div>

            <div className="flex-1">
              <label className="block text-xs text-zinc-400 font-medium mb-1.5">
                {getPlayerName(activeMatch.player2Id)}
              </label>
              <input
                type="number" min="0" max="50" value={score2}
                onChange={e => setScore2(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRecord()}
                className="w-full border border-zinc-600 rounded-xl px-3 py-3 text-2xl font-bold text-center text-white bg-zinc-800 focus:border-emerald-500 focus:outline-none transition-colors"
                placeholder="0"
              />
            </div>

            <div className="flex-shrink-0">
              <div className="h-[21px] mb-1.5" />
              <button
                onClick={handleRecord}
                className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-6 py-3.5 rounded-xl font-bold text-sm transition-colors shadow-sm whitespace-nowrap"
              >
                ✓ Record
              </button>
            </div>
          </div>

          {activeMatch.games.length > 0 && (
            <div className="mt-4 pt-3 border-t border-zinc-700">
              <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wide mb-2">Series so far (Bo{activeMatch.bestOf})</p>
              <div className="flex flex-wrap gap-2 items-center">
                {activeMatch.games.map((g, i) => {
                  const p1Won = g.score1 > g.score2;
                  if (editingGameId === g.id) {
                    return (
                      <div key={g.id} className="flex items-center gap-1.5 bg-zinc-800 rounded-xl px-3 py-1.5 border border-zinc-600">
                        <span className="text-xs text-zinc-400 font-semibold">G{i + 1}:</span>
                        <input type="number" value={editG1} onChange={e => setEditG1(e.target.value)}
                          className="w-12 border border-zinc-600 rounded-lg px-1.5 py-1 text-sm text-center font-bold text-white bg-zinc-700 focus:border-emerald-500 focus:outline-none" />
                        <span className="text-zinc-500 text-xs">–</span>
                        <input type="number" value={editG2} onChange={e => setEditG2(e.target.value)}
                          className="w-12 border border-zinc-600 rounded-lg px-1.5 py-1 text-sm text-center font-bold text-white bg-zinc-700 focus:border-emerald-500 focus:outline-none" />
                        <button onClick={async () => {
                          const s1 = parseInt(editG1); const s2 = parseInt(editG2);
                          if (isNaN(s1) || isNaN(s2)) { alert('Enter valid scores'); return; }
                          await onSaveGameEdit(g.id, s1, s2);
                          setEditingGameId(null);
                        }} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-lg font-bold transition-colors">✓</button>
                        <button onClick={() => setEditingGameId(null)}
                          className="text-xs text-zinc-500 hover:text-zinc-300 px-1 font-bold">✕</button>
                      </div>
                    );
                  }
                  return (
                    <button key={g.id}
                      onClick={() => { setEditingGameId(g.id); setEditG1(g.score1.toString()); setEditG2(g.score2.toString()); }}
                      className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-opacity hover:opacity-70 ${
                        p1Won ? 'bg-emerald-950 border-emerald-700 text-emerald-400' : 'bg-red-950 border-red-800 text-red-400'
                      }`}>
                      G{i + 1}: {g.score1}–{g.score2}
                    </button>
                  );
                })}
                <span className="text-xs text-zinc-500">
                  {activeMatch.games.filter(g => g.score1 > g.score2).length}–{activeMatch.games.filter(g => g.score2 > g.score1).length} in series
                </span>
              </div>
            </div>
          )}

          <p className="mt-2 text-xs text-zinc-500 text-center">First to 11 · win by 2</p>
        </div>
      )}

      {/* Game scores panel — completed matches in both active and history mode */}
      {activeMatch && (readOnly || !!activeMatch.winnerId) && activeMatch.games.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">Match result</p>
              <h4 className="font-bold text-white text-base">
                <span className={activeMatch.winnerId === activeMatch.player1Id ? 'text-emerald-400' : 'text-zinc-500'}>
                  {getPlayerName(activeMatch.player1Id)}
                </span>
                <span className="text-zinc-700 mx-2">vs</span>
                <span className={activeMatch.winnerId === activeMatch.player2Id ? 'text-emerald-400' : 'text-zinc-500'}>
                  {getPlayerName(activeMatch.player2Id)}
                </span>
              </h4>
            </div>
            <button onClick={() => setActiveMatchId(null)}
              className="text-zinc-600 hover:text-zinc-300 text-xl font-bold leading-none">✕</button>
          </div>
          <div className="space-y-2">
            {activeMatch.games.map((g, i) => {
              const p1Won = g.score1 > g.score2;
              return (
                <div key={g.id} className="flex items-center justify-between bg-zinc-800 rounded-xl px-4 py-2.5">
                  <span className="text-xs font-semibold text-zinc-500 w-10">G{i + 1}</span>
                  <div className="flex items-center gap-3 flex-1 justify-center">
                    <span className={`text-sm font-semibold w-24 text-right ${p1Won ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      {getPlayerName(activeMatch.player1Id)}
                    </span>
                    <span className="font-black text-white tabular-nums text-base">{g.score1} – {g.score2}</span>
                    <span className={`text-sm font-semibold w-24 text-left ${!p1Won ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      {getPlayerName(activeMatch.player2Id)}
                    </span>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border w-20 text-center ${
                    p1Won ? 'bg-emerald-950 border-emerald-700 text-emerald-400' : 'bg-red-950 border-red-800 text-red-400'
                  }`}>
                    {p1Won ? getPlayerName(activeMatch.player1Id).split(' ')[0] : getPlayerName(activeMatch.player2Id).split(' ')[0]}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-zinc-500 text-center">
            {activeMatch.games.filter(g => g.score1 > g.score2).length}–{activeMatch.games.filter(g => g.score2 > g.score1).length} series · {getPlayerName(activeMatch.winnerId!)} wins
          </p>
        </div>
      )}

    </div>
  );
}

// ── Compact bracket match card ──────────────────────────────────────────────

interface BracketCardProps {
  match: Match;
  getPlayerName: (id: string) => string;
  isActive: boolean;
  onSelect: () => void;
  isFinal?: boolean;
  readOnly?: boolean;
}

function BracketCard({ match, getPlayerName, isActive, onSelect, isFinal, readOnly = false }: BracketCardProps) {
  const p1Wins = match.games.filter(g => g.score1 > g.score2).length;
  const p2Wins = match.games.filter(g => g.score2 > g.score1).length;
  const canInteract = readOnly
    ? match.games.length > 0
    : ((!match.winnerId && match.player2Id !== 'BYE') || (!!match.winnerId && match.games.length > 0))
      && match.player1Id !== 'PLAY_IN_WINNER' && match.player2Id !== 'PLAY_IN_WINNER';

  const ring = isFinal && match.winnerId
    ? 'border-amber-600 shadow-lg shadow-amber-950'
    : isActive
    ? 'border-emerald-500 shadow-md shadow-emerald-950'
    : 'border-zinc-700 hover:border-zinc-500';

  return (
    <div
      style={{ height: CARD_H }}
      className={`relative bg-zinc-900 border rounded-xl overflow-hidden flex flex-col transition-all select-none ${ring} ${canInteract ? 'cursor-pointer' : ''}`}
      onClick={canInteract ? onSelect : undefined}
    >
      {/* Player 1 row */}
      <div className={`flex-1 flex items-center pl-3 pr-4 border-b border-zinc-800 ${match.winnerId === match.player1Id ? 'bg-emerald-950' : ''}`}>
        <span className={`truncate text-sm font-semibold flex-1 ${
          match.winnerId === match.player1Id ? 'text-emerald-400'
          : match.winnerId ? 'text-zinc-600' : 'text-zinc-200'
        }`}>
          {match.player1Id === 'PLAY_IN_WINNER' ? <em className="text-zinc-500 not-italic text-xs">Play-in winner</em> : getPlayerName(match.player1Id)}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {match.winnerId === match.player1Id && <span className="text-amber-500 text-xs leading-none">🏆</span>}
          {match.games.length > 0 && (
            <span className={`text-xs font-black tabular-nums w-4 text-center ${match.winnerId === match.player1Id ? 'text-emerald-400' : 'text-zinc-600'}`}>{p1Wins}</span>
          )}
        </div>
      </div>

      {/* Player 2 row */}
      <div className={`flex-1 flex items-center pl-3 pr-4 ${match.winnerId === match.player2Id ? 'bg-emerald-950' : ''}`}>
        <span className={`truncate text-sm font-semibold flex-1 ${
          match.winnerId === match.player2Id ? 'text-emerald-400'
          : match.winnerId ? 'text-zinc-600'
          : match.player2Id === 'BYE' || match.player2Id === 'PLAY_IN_WINNER' ? 'text-zinc-600 italic text-xs'
          : 'text-zinc-200'
        }`}>
          {match.player2Id === 'BYE' ? 'BYE'
           : match.player2Id === 'PLAY_IN_WINNER' ? <em className="not-italic text-xs">Play-in winner</em>
           : getPlayerName(match.player2Id)}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isActive && !match.winnerId && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          {match.winnerId === match.player2Id && <span className="text-amber-500 text-xs leading-none">🏆</span>}
          {match.games.length > 0 && (
            <span className={`text-xs font-black tabular-nums w-4 text-center ${match.winnerId === match.player2Id ? 'text-emerald-400' : 'text-zinc-600'}`}>{p2Wins}</span>
          )}
        </div>
      </div>
    </div>
  );
}
