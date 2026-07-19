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
    const timer = setTimeout(() => setShowModal(true), 500);
    return () => clearTimeout(timer);
  }, []);

  if (!showModal) return null;

  return (
    <>
      <Fireworks />
      <div className="modal-backdrop z-40">
        <div className="modal max-w-md mx-4 p-10 text-center">
          <p className="eyebrow mb-4">tournament complete</p>
          <h2 className="display-lg mb-2">Champion</h2>
          <p className="text-muted text-sm mb-8">{tournamentName}</p>
          <div className="panel-gold py-6 px-4 mb-8">
            <div className="display-md text-gold">{winner}</div>
          </div>
          <button onClick={onClose} className="btn btn-primary btn-lg w-full">
            Continue
          </button>
        </div>
      </div>
    </>
  );
}
