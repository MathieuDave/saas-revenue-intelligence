import { useEffect, useState, type ReactNode } from "react";
import { animate, motion } from "motion/react";

// =========================================================
// PETITS OUTILS D'ANIMATION, partagés par toute la page
// =========================================================

// La courbe de la page : un départ vif, une arrivée douce
export const EASE = [0.2, 0.8, 0.2, 1] as const;

// Un bloc qui apparaît en glissant légèrement vers le haut.
// play = false (ouverture déjà vue aujourd'hui) → apparition courte, sans délai
export function Reveal({
  children,
  delay = 0,
  play,
  className,
}: {
  children: ReactNode;
  delay?: number;
  play: boolean;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: play ? 18 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: play ? 0.6 : 0.25, delay: play ? delay : 0, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

// Un nombre qui défile jusqu'à sa valeur (seulement pendant l'ouverture)
export function CountUp({
  value,
  play,
  delay = 0,
  format,
}: {
  value: number;
  play: boolean;
  delay?: number;
  format: (n: number) => string;
}) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!play) return;
    const controls = animate(0, value, {
      duration: 0.9,
      delay,
      ease: EASE,
      onUpdate: (latest) => setShown(latest),
    });
    return () => controls.stop();
  }, [value, play, delay]);

  return <>{format(play ? shown : value)}</>;
}