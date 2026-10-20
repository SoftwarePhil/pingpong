'use client';

import { useEffect, useState } from 'react';

/** One-time bouncing ping-pong ball that plays on app load, then disappears. */
export function BouncingBall() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2900);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="bouncing-ball" aria-hidden="true">
      <div className="bouncing-ball__orb" />
    </div>
  );
}
