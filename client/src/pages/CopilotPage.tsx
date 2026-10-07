import { useState } from "react";
import "./CopilotPage.css";
import ReactMarkdown from "react-markdown";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

const suggestedQuestions = [
  "Which customers should I prioritize this week?",
  "Which accounts have the highest revenue risk?",
  "Where are the strongest expansion opportunities?",
  "Which customers are renewing in the next 30 days?",
];

function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      content:
        "Ask me about revenue, customer risk, expansion opportunities, renewals, or account priorities.",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  async function sendMessage(question?: string) {
    const message = question ?? input.trim();

    if (!message || loading) {
      return;
    }

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: message,
    };

    setMessages((current) => [
      ...current,
      userMessage,
    ]);

    setInput("");
    setLoading(true);

    try {
      const response = await fetch(
        "http://localhost:3000/api/genie/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
          question: message,
           conversationId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          "Unable to retrieve Genie response."
        );
      }


      const data = await response.json();

   if (data.conversationId) {
        setConversationId(data.conversationId);
      }

      const assistantMessage: Message = {
        id: Date.now() + 1,
        role: "assistant",
        content:
          data.answer ??
          "No response was returned.",
      };

      setMessages((current) => [
        ...current,
        assistantMessage,
      ]);
    } catch (error) {
      console.error("Genie chat error:", error);

      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content:
            "Unable to connect to the AI assistant.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    sendMessage();
  }

  return (
    <div className="copilot-page">
      <div className="app-header">
        <h1>Ask RevenueAI</h1>

        <p>
          Ask questions about revenue, customer risk,
          expansion opportunities and account priorities.
        </p>
        
      </div>

      <div className="copilot-layout">
        <section className="copilot-panel">
          <div className="copilot-messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`copilot-message ${
                  message.role === "user"
                    ? "copilot-message-user"
                    : "copilot-message-assistant"
                }`}
              >
                <span className="copilot-message-role">
                  {message.role === "user"
                    ? "You"
                    : "RevenueAI"}
                </span>

               <ReactMarkdown>
               {message.content.replace(/ - \*\*/g, "\n- **")}
              </ReactMarkdown>
              </div>
            ))}

            {loading && (
              <div className="copilot-message copilot-message-assistant">
                <span className="copilot-message-role">
                  RevenueAI
                </span>

                <p>Analyzing your data...</p>
              </div>
            )}
          </div>

          <form
            className="copilot-input-area"
            onSubmit={handleSubmit}
          >
            <input
              type="text"
              value={input}
              onChange={(event) =>
                setInput(event.target.value)
              }
              placeholder="Ask a question about your customers..."
              disabled={loading}
            />

            <button
              type="submit"
              disabled={!input.trim() || loading}
            >
              Ask
            </button>
          </form>
        </section>

        <aside className="copilot-suggestions">
          <h2>Suggested Questions</h2>

          <p>
            Try one of these questions to explore your
            revenue data.
          </p>

          <div className="copilot-suggestion-list">
            {suggestedQuestions.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() =>
                  sendMessage(question)
                }
                disabled={loading}
              >
                {question}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default CopilotPage;