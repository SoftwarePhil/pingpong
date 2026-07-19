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
  tournamentPlayers?: string[];
  onAddGame: (match: Match, score1: number, score2: number) => Promise<void>;
  onSaveGameEdit: (gameId: string, score1: number, score2: number) => Promise<void>;
  onDeleteGame?: (gameId: string) => Promise<void>;
  onChangeBestOf?: (matchId: string, bestOf: number) => Promise<void>;
  onSwapPlayers?: (matchId: string, p1: string, p2: string) => Promise<void>;
  readOnly?: boolean;
  /** When true, the bracket is a preview before starting. Allows player/bye configuration via swaps but suppresses game recording. */
  previewMode?: boolean;
}

export default function BracketView({ bracketMatches, getPlayerName, tournamentPlayers = [], onAddGame, onSaveGameEdit, onDeleteGame, onChangeBestOf, onSwapPlayers, readOnly = false, previewMode = false }: BracketViewProps) {
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [score1, setScore1] = useState('');
  const [score2, setScore2] = useState('');
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editG1, setEditG1] = useState('');
  const [editG2, setEditG2] = useState('');
  const [swapMode, setSwapMode] = useState(false);
  const [swapP1, setSwapP1] = useState('');
  const [swapP2, setSwapP2] = useState('');

  const playInMatches = bracketMatches.filter(m => (m.bracketRound ?? 0) === 0);
  const mainMatches   = bracketMatches.filter(m => (m.bracketRound ?? 0) > 0);
  const mainRounds    = [...new Set(mainMatches.map(m => m.bracketRound!))].sort((a, b) => a - b);
  const hasPlayIn     = playInMatches.length > 0;

  if (mainRounds.length === 0 && !hasPlayIn) {
    return <div className="text-center py-16 text-dim text-sm">No bracket matches yet.</div>;
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
  const isByeActiveMatch = activeMatch && (activeMatch.player1Id === 'BYE' || activeMatch.player2Id === 'BYE');
  const seriesComplete = !!activeMatch && activeMatch.games.length >= activeMatch.bestOf;
  const canSwapActiveMatch = ( !readOnly || previewMode ) && onSwapPlayers && activeMatch &&
    activeMatch.round === 'bracket' &&
    activeMatch.games.length === 0 &&
    // Allow swap on bye matches (they have winnerId set automatically but no real games)
    (!activeMatch.winnerId || isByeActiveMatch) &&
    activeMatch.player1Id !== 'PLAY_IN_WINNER' && activeMatch.player2Id !== 'PLAY_IN_WINNER' &&
    activeMatch.player1Id !== 'TBD' && activeMatch.player2Id !== 'TBD';

  // Players eligible for swap: all players in unplayed same-round matches (including bye matches).
  // Bye players are now eligible so they can be swapped with regular-match players and vice versa.
  // A "non-bye completed match" is one with real games played or a winnerId on a non-bye match.
  const isNonByeCompleted = (m: Match) =>
    m.games.length > 0 || (!!m.winnerId && m.player1Id !== 'BYE' && m.player2Id !== 'BYE');

  const eligibleSwapPlayers = (() => {
    if (!activeMatch) return tournamentPlayers;
    const sameRoundUnplayed = bracketMatches.filter(m =>
      m.bracketRound === activeMatch.bracketRound && !isNonByeCompleted(m)
    );
    return sameRoundUnplayed
      .flatMap(m => [m.player1Id, m.player2Id])
      .filter((pid, idx, arr) => arr.indexOf(pid) === idx && pid !== 'PLAY_IN_WINNER' && pid !== 'BYE' && pid !== 'TBD');
  })();

  const handleRecord = async () => {
    if (!activeMatch) return;
    if (activeMatch.games.length >= activeMatch.bestOf) return;
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

  const handleSwapSave = async () => {
    if (!activeMatch || !onSwapPlayers) return;
    if (isByeActiveMatch) {
      // Preserve which side the BYE is on. The select always holds the real player in swapP1.
      const byeOnP1 = activeMatch.player1Id === 'BYE';
      const real = swapP1;
      const arg1 = byeOnP1 ? 'BYE' : real;
      const arg2 = byeOnP1 ? real : 'BYE';
      await onSwapPlayers(activeMatch.id, arg1, arg2);
    } else {
      if (swapP1 === swapP2) { alert('Player 1 and Player 2 must be different'); return; }
      await onSwapPlayers(activeMatch.id, swapP1, swapP2);
    }
    setSwapMode(false);
    setActiveMatchId(null);
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
          <div className="flex items-center justify-center gap-3 panel-gold py-6">
            <span className="text-4xl">🏆</span>
            <div>
              <p className="eyebrow mb-1">Tournament Champion</p>
              <p className="display-md text-gold">{getPlayerName(finalMatch.winnerId!)}</p>
            </div>
          </div>
        );
      })()}

      {/* Column labels */}
      <div className="flex" style={{ gap: 0 }}>
        {hasPlayIn && (
          <div style={{ width: CARD_W + COL_GAP, flexShrink: 0 }}>
            <p className="text-center eyebrow">Play-in</p>
          </div>
        )}
        {mainRounds.map((rNum, idx) => (
          <div key={rNum} style={{ width: CARD_W + COL_GAP, flexShrink: 0 }}>
            <p className={`text-center eyebrow ${mainMatches.filter(m => m.bracketRound === rNum).length === 1 ? '' : 'text-dim'}`}>
              {hasPlayIn && idx === 0 && mainMatches.filter(m => m.bracketRound === rNum).length === 4
                ? 'Main R1 (no byes)'
                : getRoundLabel(rNum)}
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
              <path key={key} d={d} fill="none" stroke="rgba(232,184,74,0.25)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
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
                  onSelect={() => {
                    const isBye = match.player1Id === 'BYE' || match.player2Id === 'BYE';
                    setSwapMode(isBye);
                    if (isBye) {
                      const real = match.player1Id === 'BYE' ? match.player2Id : match.player1Id;
                      setSwapP1(real);
                      setSwapP2('BYE');
                    }
                    setActiveMatchId(prev => prev === match.id ? null : match.id);
                  }}
                  readOnly={readOnly}
                  previewMode={previewMode}
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
                    onSelect={() => {
                      const isBye = match.player1Id === 'BYE' || match.player2Id === 'BYE';
                      setSwapMode(isBye);
                      if (isBye) {
                        const real = match.player1Id === 'BYE' ? match.player2Id : match.player1Id;
                        setSwapP1(real);
                        setSwapP2('BYE');
                      }
                      setActiveMatchId(prev => prev === match.id ? null : match.id);
                    }}
                    isFinal={isFinalRound}
                    readOnly={readOnly}
                    previewMode={previewMode}
                  />
                </div>
              );
            });
          })}
        </div>
      </div>

      {/* Score entry / Config panel — appears below the bracket when a match is selected */}
      {activeMatch && ( !readOnly || previewMode ) && (
        <div className="bg-[var(--surface)] border border-[var(--border-gold)] rounded-lg p-5 shadow-none">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-xs font-semibold text-gold uppercase tracking-widest mb-0.5">
                {previewMode
                  ? (swapMode || isByeActiveMatch ? 'Change players / bye (preview)' : 'Adjust this match')
                  : (swapMode ? (isByeActiveMatch ? 'Change Bye' : 'Change Players') : activeMatch.winnerId ? 'Match complete — edit if needed' : 'Recording game')}
              </p>
              <h4 className="font-bold text-[var(--text)] text-base">
                {getPlayerName(activeMatch.player1Id)}
                {!isByeActiveMatch && (
                  <>
                    <span className="text-dim mx-2">vs</span>
                    {getPlayerName(activeMatch.player2Id)}
                  </>
                )}
                {isByeActiveMatch && <span className="text-dim text-sm font-normal ml-2">(bye)</span>}
              </h4>
            </div>
            <div className="flex items-center gap-2">
              {canSwapActiveMatch && !isByeActiveMatch && !previewMode && (
                <button
                  onClick={() => {
                    setSwapMode(v => !v);
                    setSwapP1(activeMatch.player1Id);
                    setSwapP2(activeMatch.player2Id);
                  }}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${swapMode ? 'bg-[var(--gold)] text-[#0a0908] border-[var(--gold)]' : 'bg-[var(--surface)] text-gold border-[var(--border-gold)] hover:bg-[rgba(232,184,74,0.06)]'}`}
                  title="Change players in this match"
                >
                  ↔ Players
                </button>
              )}
              <button onClick={() => { setActiveMatchId(null); setScore1(''); setScore2(''); setSwapMode(false); }}
                className="text-dim hover:text-muted text-xl font-bold leading-none">✕</button>
            </div>
          </div>

          {(swapMode || isByeActiveMatch || previewMode) ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                {isByeActiveMatch ? (
                  <>
                    <label className="block text-xs text-muted font-medium">Who gets this bye?</label>
                    <select value={swapP1} onChange={e => setSwapP1(e.target.value)}
                      className="w-full border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] bg-[var(--surface)] focus:border-[var(--gold)] focus:outline-none">
                      {eligibleSwapPlayers.map(pid => (
                        <option key={pid} value={pid}>{getPlayerName(pid)}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <label className="block text-xs text-muted font-medium">Player 1</label>
                    <select value={swapP1} onChange={e => setSwapP1(e.target.value)}
                      className="w-full border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] bg-[var(--surface)] focus:border-[var(--gold)] focus:outline-none">
                      {eligibleSwapPlayers.map(pid => (
                        <option key={pid} value={pid}>{getPlayerName(pid)}</option>
                      ))}
                    </select>
                    <div className="text-center text-xs text-dim font-bold py-1">vs</div>
                    <select value={swapP2} onChange={e => setSwapP2(e.target.value)}
                      className="w-full border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] bg-[var(--surface)] focus:border-[var(--gold)] focus:outline-none">
                      {eligibleSwapPlayers.map(pid => (
                        <option key={pid} value={pid}>{getPlayerName(pid)}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSwapSave}
                  className="flex-1 bg-[var(--gold)] hover:bg-[var(--gold-bright)] text-[#0a0908] text-sm px-4 py-2.5 rounded-lg font-bold transition-colors">
                  Save
                </button>
                <button onClick={() => { setSwapMode(false); if (isByeActiveMatch) setActiveMatchId(null); }}
                  className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text)] text-sm px-4 py-2.5 rounded-lg font-bold transition-colors">
                  Cancel
                </button>
              </div>
              <p className="text-xs text-dim text-center">Displaced players are moved to other unplayed matches in the same round</p>
              {previewMode && (
                <p className="text-[11px] text-gold text-center font-medium">Preview mode — apply your changes, then start the bracket to commit this structure.</p>
              )}
            </div>
          ) : (
            <>
              {!previewMode && onChangeBestOf && (
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[var(--border)]">
                  <span className="text-xs text-muted font-medium">Best of</span>
                  <div className="flex gap-1">
                    {[1, 3, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => onChangeBestOf(activeMatch.id, n)}
                        className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                          activeMatch.bestOf === n
                            ? 'bg-[var(--gold)] text-[#0a0908] border-[var(--gold)]'
                            : 'bg-[var(--surface)] text-muted border-[var(--border)] hover:bg-[var(--surface)]'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  {activeMatch.winnerId && (
                    <span className="text-[11px] text-gold ml-1">Changing games may correct the winner and later-round matches</span>
                  )}
                </div>
              )}

              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-muted font-medium mb-1.5">
                    {getPlayerName(activeMatch.player1Id)}
                  </label>
                  <input
                    type="number" min="0" max="50" value={score1}
                    onChange={e => setScore1(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRecord()}
                    disabled={seriesComplete}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-3 text-2xl font-bold text-center text-[var(--text)] focus:border-[var(--gold)] focus:outline-none transition-colors disabled:bg-[var(--surface)] disabled:text-dim disabled:cursor-not-allowed"
                    placeholder="0"
                  />
                </div>

                <div className="pb-3 text-2xl text-dim font-bold select-none">—</div>

                <div className="flex-1">
                  <label className="block text-xs text-muted font-medium mb-1.5">
                    {getPlayerName(activeMatch.player2Id)}
                  </label>
                  <input
                    type="number" min="0" max="50" value={score2}
                    onChange={e => setScore2(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRecord()}
                    disabled={seriesComplete}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-3 text-2xl font-bold text-center text-[var(--text)] focus:border-[var(--gold)] focus:outline-none transition-colors disabled:bg-[var(--surface)] disabled:text-dim disabled:cursor-not-allowed"
                    placeholder="0"
                  />
                </div>

                <div className="flex-shrink-0">
                  <div className="h-[21px] mb-1.5" />
                  <button
                    onClick={handleRecord}
                    disabled={seriesComplete}
                    title={seriesComplete ? `Series is already complete (Bo${activeMatch.bestOf}) — increase "Best of" above to record more games` : undefined}
                    className="btn btn-primary disabled:bg-[var(--surface-3)] disabled:text-dim disabled:cursor-not-allowed disabled:hover:bg-[var(--surface-3)] disabled:shadow-none disabled:border-transparent px-6 py-3.5"
                  >
                    ✓ Record
                  </button>
                </div>
              </div>

              {seriesComplete && (
                <p className="mt-2 text-xs text-gold text-center">
                  Series complete at Bo{activeMatch.bestOf} — increase &quot;Best of&quot; above to record additional games.
                </p>
              )}

              {activeMatch.games.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--border)]">
                  <p className="text-xs text-dim font-semibold uppercase tracking-wide mb-2">Series so far (Bo{activeMatch.bestOf})</p>
                  <div className="flex flex-wrap gap-2 items-center">
                    {activeMatch.games.map((g, i) => {
                      const p1Won = g.score1 > g.score2;
                      if (editingGameId === g.id) {
                        return (
                          <div key={g.id} className="flex items-center gap-1.5 bg-[var(--surface)] rounded-lg px-3 py-1.5 border border-[var(--border-gold)]">
                            <span className="text-xs text-muted font-semibold">G{i + 1}:</span>
                            <input type="number" value={editG1} onChange={e => setEditG1(e.target.value)}
                              className="w-12 border border-[var(--border-strong)] rounded-lg px-1.5 py-1 text-sm text-center font-bold text-[var(--text)] bg-[var(--surface)] focus:border-[var(--gold)] focus:outline-none" />
                            <span className="text-dim text-xs">–</span>
                            <input type="number" value={editG2} onChange={e => setEditG2(e.target.value)}
                              className="w-12 border border-[var(--border-strong)] rounded-lg px-1.5 py-1 text-sm text-center font-bold text-[var(--text)] bg-[var(--surface)] focus:border-[var(--gold)] focus:outline-none" />
                            <button onClick={async () => {
                              const s1 = parseInt(editG1); const s2 = parseInt(editG2);
                              if (isNaN(s1) || isNaN(s2)) { alert('Enter valid scores'); return; }
                              await onSaveGameEdit(g.id, s1, s2);
                              setEditingGameId(null);
                            }} className="btn btn-primary btn-sm">✓</button>
                            <button onClick={() => setEditingGameId(null)}
                              className="text-xs text-dim hover:text-muted px-1 font-bold">✕</button>
                          </div>
                        );
                      }
                      return (
                        <div key={g.id} className={`flex items-center gap-1 text-xs font-bold pl-2.5 pr-1 py-1 rounded-full border ${
                            p1Won ? 'bg-[rgba(94,234,154,0.08)] border-[rgba(94,234,154,0.3)] text-win' : 'bg-red-50 border-red-200 text-red-700'
                          }`}>
                          <button
                            onClick={() => { setEditingGameId(g.id); setEditG1(g.score1.toString()); setEditG2(g.score2.toString()); }}
                            className="hover:opacity-70 transition-opacity"
                          >
                            G{i + 1}: {g.score1}–{g.score2}
                          </button>
                          {onDeleteGame && (
                            <button
                              onClick={() => onDeleteGame(g.id)}
                              title="Delete this game"
                              className="text-dim hover:text-loss px-1 leading-none"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <span className="text-xs text-dim">
                      {activeMatch.games.filter(g => g.score1 > g.score2).length}–{activeMatch.games.filter(g => g.score2 > g.score1).length} in series
                    </span>
                  </div>
                </div>
              )}

              <p className="mt-2 text-xs text-dim text-center">First to 11 · win by 2</p>
            </>
          )}
        </div>
      )}

      {/* Game scores panel — read-only history view only (editable views show the full edit panel above) */}
      {activeMatch && readOnly && !previewMode && !!activeMatch.winnerId && activeMatch.games.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 shadow-none">
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="text-xs font-semibold text-dim uppercase tracking-widest mb-0.5">Match result</p>
              <h4 className="font-bold text-[var(--text)] text-base">
                <span className={activeMatch.winnerId === activeMatch.player1Id ? 'text-win' : 'text-muted'}>
                  {getPlayerName(activeMatch.player1Id)}
                </span>
                <span className="text-dim mx-2">vs</span>
                <span className={activeMatch.winnerId === activeMatch.player2Id ? 'text-win' : 'text-muted'}>
                  {getPlayerName(activeMatch.player2Id)}
                </span>
              </h4>
            </div>
            <button onClick={() => setActiveMatchId(null)}
              className="text-dim hover:text-muted text-xl font-bold leading-none">✕</button>
          </div>
          <div className="space-y-2">
            {activeMatch.games.map((g, i) => {
              const p1Won = g.score1 > g.score2;
              return (
                <div key={g.id} className="flex items-center justify-between bg-[var(--surface)] rounded-lg px-4 py-2.5">
                  <span className="text-xs font-semibold text-dim w-10">G{i + 1}</span>
                  <div className="flex items-center gap-3 flex-1 justify-center">
                    <span className={`text-sm font-semibold w-24 text-right ${p1Won ? 'text-win' : 'text-dim'}`}>
                      {getPlayerName(activeMatch.player1Id)}
                    </span>
                    <span className="font-black text-[var(--text)] tabular-nums text-base">{g.score1} – {g.score2}</span>
                    <span className={`text-sm font-semibold w-24 text-left ${!p1Won ? 'text-win' : 'text-dim'}`}>
                      {getPlayerName(activeMatch.player2Id)}
                    </span>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border w-20 text-center ${
                    p1Won ? 'bg-[rgba(94,234,154,0.08)] border-[rgba(94,234,154,0.3)] text-win' : 'bg-red-50 border-red-200 text-red-700'
                  }`}>
                    {p1Won ? getPlayerName(activeMatch.player1Id).split(' ')[0] : getPlayerName(activeMatch.player2Id).split(' ')[0]}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-dim text-center">
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
  previewMode?: boolean;
}

function BracketCard({ match, getPlayerName, isActive, onSelect, isFinal, readOnly = false, previewMode = false }: BracketCardProps) {
  const p1Wins = match.games.filter(g => g.score1 > g.score2).length;
  const p2Wins = match.games.filter(g => g.score2 > g.score1).length;
  const isByeMatch = match.player1Id === 'BYE' || match.player2Id === 'BYE';
  const canInteract = (readOnly && !previewMode)
    ? match.games.length > 0
    : ((!match.winnerId && !isByeMatch) ||                  // regular unplayed match
        (!!match.winnerId && match.games.length > 0) ||     // completed match (view scores)
        (isByeMatch && (!readOnly || previewMode)) ||       // bye match (swap player) — allow in preview for config
        previewMode)                                        // in preview allow selecting unplayed for config
      && match.player1Id !== 'PLAY_IN_WINNER' && match.player2Id !== 'PLAY_IN_WINNER'
      && match.player1Id !== 'TBD' && match.player2Id !== 'TBD';

  const ring = isFinal && match.winnerId
    ? 'border-amber-400 shadow-none shadow-amber-100'
    : isActive
    ? 'border-[var(--gold)] shadow-[0_0_20px_rgba(232,184,74,0.15)]'
    : 'border-[var(--border)] hover:border-[var(--border-strong)]';

  return (
    <div
      style={{ height: CARD_H }}
      className={`relative bg-[var(--surface)] border-2 rounded-lg shadow-none overflow-hidden flex flex-col transition-all select-none ${ring} ${canInteract ? 'cursor-pointer' : ''}`}
      onClick={canInteract ? onSelect : undefined}
    >
      {/* Player 1 row */}
      <div className={`flex-1 flex items-center pl-3 pr-4 border-b border-[var(--border)] ${match.winnerId === match.player1Id ? 'bg-[rgba(94,234,154,0.08)]' : ''}`}>
        <span className={`truncate text-sm font-semibold flex-1 ${
          match.winnerId === match.player1Id ? 'text-win'
          : match.winnerId ? 'text-dim' : 'text-[var(--text)]'
        }`}>
          {match.player1Id === 'BYE' ? 'BYE'
            : match.player1Id === 'PLAY_IN_WINNER' ? <em className="text-dim not-italic text-xs">Play-in winner</em>
            : match.player1Id === 'TBD' ? <em className="text-dim not-italic text-xs">TBD</em>
            : getPlayerName(match.player1Id)}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {match.winnerId === match.player1Id && <span className="text-gold text-xs leading-none">🏆</span>}
          {match.games.length > 0 && (
            <span className={`text-xs font-black tabular-nums w-4 text-center ${match.winnerId === match.player1Id ? 'text-win' : 'text-dim'}`}>{p1Wins}</span>
          )}
        </div>
      </div>

      {/* Player 2 row */}
      <div className={`flex-1 flex items-center pl-3 pr-4 ${match.winnerId === match.player2Id ? 'bg-[rgba(94,234,154,0.08)]' : ''}`}>
        <span className={`truncate text-sm font-semibold flex-1 ${
          match.winnerId === match.player2Id ? 'text-win'
          : match.winnerId ? 'text-dim'
          : match.player2Id === 'BYE' || match.player2Id === 'PLAY_IN_WINNER' || match.player2Id === 'TBD' ? 'text-dim italic text-xs'
          : 'text-[var(--text)]'
        }`}>
          {match.player2Id === 'BYE' ? 'BYE'
           : match.player2Id === 'PLAY_IN_WINNER' ? <em className="not-italic text-xs">Play-in winner</em>
           : match.player2Id === 'TBD' ? <em className="not-italic text-xs">TBD</em>
           : getPlayerName(match.player2Id)}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isActive && !match.winnerId && <span className="w-1.5 h-1.5 rounded-full bg-[rgba(232,184,74,0.06)]0 animate-pulse" />}
          {match.winnerId === match.player2Id && <span className="text-gold text-xs leading-none">🏆</span>}
          {match.games.length > 0 && (
            <span className={`text-xs font-black tabular-nums w-4 text-center ${match.winnerId === match.player2Id ? 'text-win' : 'text-dim'}`}>{p2Wins}</span>
          )}
        </div>
      </div>
    </div>
  );
}
