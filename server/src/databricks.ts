import "dotenv/config";
import { DBSQLClient } from "@databricks/sql";

const serverHostname = process.env.DATABRICKS_SERVER_HOSTNAME;
const httpPath = process.env.DATABRICKS_HTTP_PATH;

if (!serverHostname || !httpPath) {
  throw new Error(
    "DATABRICKS_SERVER_HOSTNAME ou DATABRICKS_HTTP_PATH est manquant dans .env"
  );
}

const host: string = serverHostname;
const path: string = httpPath;

const client = new DBSQLClient();

export async function connectToDatabricks() {
  console.log("Connecting to Databricks...");

  // Avec un jeton (Vercel) : le serveur se connecte tout seul.
  // Sans jeton (PC) : connexion par le navigateur, comme avant.
  const token = process.env.DATABRICKS_TOKEN;

  const connection = token
    ? await client.connect({ host, path, token })
    : await client.connect({ authType: "databricks-oauth", host, path });

  console.log("Databricks connection initialized.");

  return connection;
}