// =========================================================
// L'OUVERTURE COMPLÈTE : UNE SEULE FOIS PAR JOUR
// Le VP qui rouvre la page arrive directement sur son brief.
// =========================================================

const KEY = "revenueai:brief-intro";

// La date du jour, à l'heure locale du VP : "2026-10-07"
export function todayKey(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function shouldPlayIntro(today: string): boolean {
  // « Réduire les animations » activé dans le système → jamais d'ouverture
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  // localStorage peut être bloqué (navigation privée) : on reste prudent
  try {
    return window.localStorage.getItem(KEY) !== today;
  } catch {
    return true;
  }
}

export function markIntroPlayed(today: string): void {
  try {
    window.localStorage.setItem(KEY, today);
  } catch {
    // Rien de grave : l'ouverture rejouera simplement la prochaine fois
  }
}