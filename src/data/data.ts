import fs from 'fs';
import path from 'path';
import { Player, Tournament, Match, Game } from '../types/pingpong';

const DATA_DIR = path.join(process.cwd(), 'src/data');

// In-memory data store
let players: Player[] = [];
let tournaments: Tournament[] = [];
let matches: Match[] = [];
let games: Game[] = [];

// File paths
const playersPath = path.join(DATA_DIR, 'players.json');
const tournamentsPath = path.join(DATA_DIR, 'tournaments.json');
const matchesPath = path.join(DATA_DIR, 'matches.json');
const gamesPath = path.join(DATA_DIR, 'games.json');

// Load data from files
export function loadData() {
  try {
    if (fs.existsSync(playersPath)) {
      players = JSON.parse(fs.readFileSync(playersPath, 'utf8'));
    }
    if (fs.existsSync(tournamentsPath)) {
      tournaments = JSON.parse(fs.readFileSync(tournamentsPath, 'utf8'));
    }
    if (fs.existsSync(matchesPath)) {
      matches = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));
    }
    if (fs.existsSync(gamesPath)) {
      games = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
    }
    console.log('Data loaded from files');
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Save data to files
export function saveData() {
  try {
    fs.writeFileSync(playersPath, JSON.stringify(players, null, 2));
    fs.writeFileSync(tournamentsPath, JSON.stringify(tournaments, null, 2));
    fs.writeFileSync(matchesPath, JSON.stringify(matches, null, 2));
    fs.writeFileSync(gamesPath, JSON.stringify(games, null, 2));
    console.log('Data saved to files');
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Getters
export function getPlayers(): Player[] {
  return [...players];
}

export function getTournaments(): Tournament[] {
  return [...tournaments];
}

export function getMatches(): Match[] {
  return [...matches];
}

export function getGames(): Game[] {
  return [...games];
}

// Setters (for replacing entire arrays)
export function setPlayers(data: Player[]) {
  players = [...data];
}

export function setTournaments(data: Tournament[]) {
  tournaments = [...data];
}

export function setMatches(data: Match[]) {
  matches = [...data];
}

export function setGames(data: Game[]) {
  games = [...data];
}

// Initialize on module load
loadData();