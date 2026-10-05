import "dotenv/config";
import { GenieClient } from "@databricks/sdk-genie/v1";

const spaceId = process.env.DATABRICKS_GENIE_AGENT_ID;

if (!spaceId) {
  throw new Error("DATABRICKS_GENIE_AGENT_ID is missing from .env");
}

// Uses Databricks unified authentication.
// DATABRICKS_CONFIG_PROFILE in .env points to the OAuth profile
// created with `databricks auth login`.
const genieClient = new GenieClient({});


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