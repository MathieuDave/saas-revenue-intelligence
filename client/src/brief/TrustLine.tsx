import { useEffect, useState } from "react";

// =========================================================
// UNE SEULE LIGNE DE CONFIANCE, sous « Your decisions today »
// Le détail (un matin passé rejoué) vit dans TrackRecord.tsx,
// gardé pour la page histoire destinée aux recruteurs.
// =========================================================

const API_URL = "http://localhost:3000/api";

type TrackRecordResponse = {
  churned: number;
  warned: number;
  warnedPct: number;
  avgMonthsAhead: number;
};

export default function TrustLine({ month }: { month: string }) {
  const [record, setRecord] = useState<TrackRecordResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_URL}/track-record?month=${month}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API error ${response.status}`);
        return response.json() as Promise<TrackRecordResponse>;
      })
      .then(setRecord)
      .catch((err: unknown) => {
        // Information secondaire : en cas d'erreur, on ne l'affiche pas
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error(err);
      });

    return () => controller.abort();
  }, [month]);

  if (!record || record.churned === 0) return null;

  return (
    <p className="desk__trust">
      Your agents flagged {record.warnedPct}% of the customers you lost, about{" "}
      {record.avgMonthsAhead} months before they left ({record.warned} of{" "}
      {record.churned}).
    </p>
  );
}