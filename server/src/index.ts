import { getFollowUps } from "./routes/followups.js";
import { AS_OF_DATE } from "./agents/tools.js";

/*
 * Démarrage sur le PC seulement (Vercel utilise app.ts directement).
 * Importé dynamiquement pour pouvoir attraper un échec de connexion Databricks.
 */
const PORT = 3000;

try {
  const { default: app, databricks } = await import("./app.js");

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Préchauffage : réveiller l'entrepôt Databricks et remplir le cache du suivi
    // du mois de démo, pour que la première page ne soit pas lente.
    // Sans « await » : le serveur répond déjà pendant ce temps.
    const demoMonth = AS_OF_DATE.slice(0, 7); // "2026-08"
    const started = Date.now();
    getFollowUps(databricks, demoMonth)
      .then(() => {
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        console.log(`Warm-up done in ${seconds} s (follow-ups ${demoMonth} cached)`);
      })
      .catch((error) => {
        // Un échec ici n'empêche rien : la page fera simplement la requête elle-même
        console.error("Warm-up failed:", error);
      });
  });
} catch (error) {
  console.error(
    "Unable to initialize Databricks connection:",
    error
  );

  process.exit(1);
}
