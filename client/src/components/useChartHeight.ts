import { useSyncExternalStore } from "react";

// Même seuil que les règles « téléphone » de App.css
const PHONE = "(max-width: 700px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isPhone() {
  return window.matchMedia(PHONE).matches;
}

// La hauteur d'un graphique : celle d'origine sur ordinateur, plus petite sur téléphone.
// La librairie de graphiques impose sa hauteur, le CSS seul ne peut pas la changer.
export function useChartHeight(desktop: number, phone: number): number {
  const small = useSyncExternalStore(subscribe, isPhone, () => false);
  return small ? phone : desktop;
}
