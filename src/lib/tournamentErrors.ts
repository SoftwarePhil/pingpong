import { NextResponse } from 'next/server';

/**
 * Errors thrown while changing a tournament. They live outside the data
 * module so routes can recognise them even when tests mock that module.
 */

export class TournamentNotFoundError extends Error {
  constructor(tournamentId: string) {
    super(`Tournament ${tournamentId} not found`);
    this.name = 'TournamentNotFoundError';
  }
}

/** Another request kept changing the tournament, and every retry lost the race. */
export class TournamentConflictError extends Error {
  constructor(tournamentId: string) {
    super(`Tournament ${tournamentId} was changed by another request`);
    this.name = 'TournamentConflictError';
  }
}

/**
 * Thrown from inside a tournament change to refuse it. Nothing is saved, and
 * the route answers with `status` and the message.
 */
export class TournamentChangeRejected extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = 'TournamentChangeRejected';
  }
}

/** Shorthand for throwing a refusal from inside a change. */
export function reject(message: string, status: 400 | 404 | 409 = 400): never {
  throw new TournamentChangeRejected(message, status);
}

/** The response for a tournament-change error, or null for any other error. */
export function tournamentErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof TournamentChangeRejected) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof TournamentNotFoundError) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
  }
  if (error instanceof TournamentConflictError) {
    return NextResponse.json(
      { error: 'Someone else changed this tournament at the same time. Please try again.' },
      { status: 409 },
    );
  }
  return null;
}
