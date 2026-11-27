'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Tournament } from '../types/pingpong';
import { parseLiveServerMessage } from '../lib/liveProtocol';
import {
  applyTournamentRemoval,
  applyTournamentUpdate,
  nextReconnectDelayMs,
} from '../lib/liveTournamentsState';

export interface LiveTournamentPushEvent {
  previous?: Tournament;
  tournament: Tournament;
}

export interface LiveTournamentRemovedEvent {
  tournamentId: string;
  reason: 'ended' | 'deleted';
  previous?: Tournament;
  tournament?: Tournament;
}

export interface UseLiveTournamentsOptions {
  clubId: string;
  clubApi: (path: string) => string;
  /** Called when a WebSocket push updates a tournament (newer version). */
  onTournamentPush?: (event: LiveTournamentPushEvent) => void;
  /** Called when a WebSocket push ends or deletes a tournament. */
  onTournamentRemoved?: (event: LiveTournamentRemovedEvent) => void;
  /** Called after reconnecting so callers can refetch companion data (games, players). */
  onReconnect?: () => void;
}

/**
 * Loads a club's tournaments and keeps them live over `/ws`.
 * Ignores stale versions, reconnects with exponential backoff, and refetches
 * everything after reconnecting so nothing missed while offline is lost.
 */
export function useLiveTournaments({
  clubId,
  clubApi,
  onTournamentPush,
  onTournamentRemoved,
  onReconnect,
}: UseLiveTournamentsOptions) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const tournamentsRef = useRef<Tournament[]>(tournaments);
  tournamentsRef.current = tournaments;

  const connectedRef = useRef(connected);
  connectedRef.current = connected;

  const clubApiRef = useRef(clubApi);
  clubApiRef.current = clubApi;

  const onPushRef = useRef(onTournamentPush);
  onPushRef.current = onTournamentPush;

  const onRemovedRef = useRef(onTournamentRemoved);
  onRemovedRef.current = onTournamentRemoved;

  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  const versionWaitersRef = useRef<
    Array<{ tournamentId: string; minVersion: number; resolve: (t: Tournament) => void }>
  >([]);

  const notifyVersionWaiters = useCallback((list: Tournament[]) => {
    if (versionWaitersRef.current.length === 0) return;
    const remaining: typeof versionWaitersRef.current = [];
    for (const waiter of versionWaitersRef.current) {
      const match = list.find(t => t.id === waiter.tournamentId);
      if (match && (match.version ?? 0) >= waiter.minVersion) {
        waiter.resolve(match);
      } else {
        remaining.push(waiter);
      }
    }
    versionWaitersRef.current = remaining;
  }, []);

  const refetch = useCallback(async (): Promise<Tournament[]> => {
    try {
      const res = await fetch(clubApiRef.current('/api/tournaments'));
      if (!res.ok) return tournamentsRef.current;
      const data: Tournament[] = await res.json();
      tournamentsRef.current = data;
      setTournaments(data);
      notifyVersionWaiters(data);
      return data;
    } catch {
      return tournamentsRef.current;
    } finally {
      setIsLoading(false);
    }
  }, [notifyVersionWaiters]);

  const applyTournament = useCallback(
    (incoming: Tournament, incomingVersion?: number) => {
      const result = applyTournamentUpdate(tournamentsRef.current, incoming, incomingVersion);
      if (!result.applied) return false;
      tournamentsRef.current = result.tournaments;
      setTournaments(result.tournaments);
      notifyVersionWaiters(result.tournaments);
      return true;
    },
    [notifyVersionWaiters],
  );

  const removeTournament = useCallback((tournamentId: string) => {
    const result = applyTournamentRemoval(tournamentsRef.current, tournamentId, 'deleted');
    if (!result.applied) return;
    tournamentsRef.current = result.tournaments;
    setTournaments(result.tournaments);
  }, []);

  /**
   * Resolves with the tournament once its version reaches `minVersion` via WS,
   * falling back to `refetch()` if the socket is offline or doesn't deliver in time.
   */
  const waitForTournamentVersion = useCallback(
    (tournamentId: string, minVersion: number, timeoutMs = 450): Promise<Tournament | undefined> => {
      const current = tournamentsRef.current.find(t => t.id === tournamentId);
      if (current && (current.version ?? 0) >= minVersion) {
        return Promise.resolve(current);
      }
      if (!connectedRef.current) {
        return refetch().then(list => list.find(t => t.id === tournamentId));
      }
      return new Promise<Tournament | undefined>((resolve) => {
        const entry = {
          tournamentId,
          minVersion,
          resolve: (t: Tournament) => {
            clearTimeout(timer);
            resolve(t);
          },
        };
        const timer = setTimeout(() => {
          versionWaitersRef.current = versionWaitersRef.current.filter(w => w !== entry);
          void refetch().then(list => resolve(list.find(t => t.id === tournamentId)));
        }, timeoutMs);
        versionWaitersRef.current.push(entry);
      });
    },
    [refetch],
  );

  useEffect(() => {
    void refetch();
  }, [clubId, refetch]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let needsResync = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws?clubId=${encodeURIComponent(clubId)}`;

    const scheduleReconnect = () => {
      if (disposed) return;
      const delay = nextReconnectDelayMs(attempt++);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed) return;
      try {
        socket = new WebSocket(url);
      } catch {
        needsResync = true;
        scheduleReconnect();
        return;
      }

      socket.addEventListener('open', () => {
        if (disposed) {
          socket?.close();
          return;
        }
        attempt = 0;
        setConnected(true);
        connectedRef.current = true;
        try {
          socket?.send(JSON.stringify({ type: 'subscribe', clubId }));
        } catch {
          // Will reconnect on close.
        }
        if (needsResync) {
          needsResync = false;
          void refetch();
          onReconnectRef.current?.();
        }
      });

      socket.addEventListener('message', (event) => {
        if (disposed || typeof event.data !== 'string') return;
        const msg = parseLiveServerMessage(event.data);
        if (!msg) return;

        if (msg.type === 'tournament') {
          if (msg.tournament.clubId !== clubId) return;
          const result = applyTournamentUpdate(tournamentsRef.current, msg.tournament, msg.version);
          if (!result.applied) return;
          tournamentsRef.current = result.tournaments;
          setTournaments(result.tournaments);
          notifyVersionWaiters(result.tournaments);
          onPushRef.current?.({
            previous: result.previous,
            tournament: result.tournaments.find(t => t.id === msg.tournament.id) ?? msg.tournament,
          });
        } else if (msg.type === 'tournament_removed') {
          const result = applyTournamentRemoval(
            tournamentsRef.current,
            msg.tournamentId,
            msg.reason,
            msg.tournament,
            msg.version,
          );
          if (!result.applied) return;
          tournamentsRef.current = result.tournaments;
          setTournaments(result.tournaments);
          notifyVersionWaiters(result.tournaments);
          onRemovedRef.current?.({
            tournamentId: msg.tournamentId,
            reason: msg.reason,
            previous: result.previous,
            tournament: msg.tournament,
          });
        }
      });

      socket.addEventListener('close', () => {
        if (disposed) return;
        setConnected(false);
        connectedRef.current = false;
        needsResync = true;
        scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        // Browser fires close right after error; ensure socket closes.
        try {
          socket?.close();
        } catch {
          // ignore
        }
      });
    };

    connect();

    return () => {
      disposed = true;
      setConnected(false);
      connectedRef.current = false;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (socket) {
        try {
          socket.close();
        } catch {
          // ignore
        }
      }
    };
  }, [clubId, notifyVersionWaiters, refetch]);

  return {
    tournaments,
    tournamentsRef,
    isLoading,
    connected,
    connectedRef,
    applyTournament,
    removeTournament,
    refetch,
    waitForTournamentVersion,
  };
}
