'use client';

import { useEffect, useState } from 'react';

/** Small bounce that settles near the header logo on load. */
export function BouncingBall() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="bouncing-ball" aria-hidden="true">
      <div className="bouncing-ball__orb" />
    </div>
  );
}
