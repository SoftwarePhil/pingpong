'use client';

import { useEffect, useState } from 'react';
import Fireworks from './Fireworks';

interface CelebrationModalProps {
  winner: string;
  tournamentName: string;
  onClose: () => void;
}

export default function CelebrationModal({ winner, tournamentName, onClose }: CelebrationModalProps) {
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Delay showing modal for dramatic effect
    const timer = setTimeout(() => setShowModal(true), 500);
    return () => clearTimeout(timer);
  }, []);

  if (!showModal) return null;

  return (
    <>
      <Fireworks />
      <div className="fixed inset-0 bg-board/80 flex items-center justify-center z-40">
        <div className="bg-surface rounded-lg p-8 max-w-md w-full mx-4 text-center transform animate-bounce">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-3xl font-bold text-ink mb-2">Tournament Complete!</h2>
          <p className="text-lg text-ink-soft mb-4">{tournamentName}</p>
          <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-white px-6 py-3 rounded-full text-xl font-bold mb-6">
            🏆 Champion: {winner} 🏆
          </div>
          <button
            onClick={onClose}
            className="bg-table hover:bg-table text-surface px-6 py-2 rounded-lg font-semibold transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </>
  );
}