import "dotenv/config";
import { GenieClient } from "@databricks/sdk-genie/v1";
import { newTokenCredentials, tokenProviderFn } from "@databricks/sdk-auth";

const spaceId = process.env.DATABRICKS_GENIE_AGENT_ID;

if (!spaceId) {
  throw new Error("DATABRICKS_GENIE_AGENT_ID is missing from .env");
}

// With DATABRICKS_TOKEN (Vercel): the token is used directly, the CLI profile is ignored.
// Without it (PC): Databricks unified authentication, where
// DATABRICKS_CONFIG_PROFILE in .env points to the OAuth profile
// created with `databricks auth login`.
const token = process.env.DATABRICKS_TOKEN;
const host = (process.env.DATABRICKS_SERVER_HOSTNAME ?? "")
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");

const genieClient = new GenieClient(
  token
    ? {
        host: `https://${host}`,
        credentials: newTokenCredentials(
          "pat",
          tokenProviderFn(async () => ({ value: token }))
        ),
        profileOptions: { noProfile: true, disableEnv: true },
      }
    : {}
);


export async function askGenie(
  question: string,
  conversationId?: string
) {
  if (!question.trim()) {
    throw new Error("Question cannot be empty");
  }

  const waiter = conversationId
  ? await genieClient.genieCreateConversationMessage({
      spaceId,
      conversationId,
      content: question,
    })
  : await genieClient.genieStartConversation({
      spaceId,
      content: question,
    });

  const message = await waiter.wait();

  const answerAttachment = message.attachments?.find(
  (item) =>
    item.attachment?.$case === "text" &&
    item.attachment.text.purpose === "TEXT_ATTACHMENT_PURPOSE_ANSWER"
);

const answer =
  answerAttachment?.attachment?.$case === "text"
    ? answerAttachment.attachment.text.content
    : undefined;

  if (!answer) {
    throw new Error("Genie completed the request but returned no text answer");
  }

  return {
    answer,
    conversationId: waiter.conversationId,
    messageId: waiter.messageId,
  };
}