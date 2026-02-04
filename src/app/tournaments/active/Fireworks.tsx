'use client';

import { useEffect, useState } from 'react';

interface Firework {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
}

export default function Fireworks() {
  const [fireworks, setFireworks] = useState<Firework[]>([]);

  useEffect(() => {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b', '#6c5ce7', '#a29bfe', '#fd79a8'];

    const createFirework = () => {
      const firework: Firework = {
        id: Date.now() + Math.random(),
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight * 0.6, // Keep fireworks in upper portion
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 20 + 10,
      };

      setFireworks(prev => [...prev, firework]);

      // Remove firework after animation
      setTimeout(() => {
        setFireworks(prev => prev.filter(f => f.id !== firework.id));
      }, 2000);
    };

    // Create fireworks periodically
    const interval = setInterval(createFirework, 300);

    // Create initial burst
    for (let i = 0; i < 5; i++) {
      setTimeout(createFirework, i * 200);
    }

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {fireworks.map((firework) => (
        <div
          key={firework.id}
          className="absolute animate-ping"
          style={{
            left: firework.x,
            top: firework.y,
            width: firework.size,
            height: firework.size,
            backgroundColor: firework.color,
            borderRadius: '50%',
            boxShadow: `0 0 ${firework.size}px ${firework.color}`,
          }}
        />
      ))}
    </div>
  );
}