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

  const connection = await client.connect({
    authType: "databricks-oauth",
    host,
    path,
  });

  console.log("Databricks connection initialized.");

  return connection;
}