// Google Gemini AI Integration for @cognix mentions
// Docs: https://ai.google.dev/gemini-api/docs

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent";

interface ChatMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

// System prompt for Cognix AI
const COGNIX_SYSTEM_PROMPT = `You are Cognix, a friendly and helpful AI assistant integrated into VelleBaazi chat. 
You help users with questions, provide information, and engage in helpful conversations.
Keep responses concise and friendly since this is a chat environment.
Use emojis occasionally to be more engaging 😊
If asked about yourself, say you're Cognix, the AI assistant for VelleBaazi.`;

// Check if message contains @cognix mention
export const hasCognixMention = (text: string): boolean => {
  return /@cognix/i.test(text);
};

// Extract the query after @cognix mention
export const extractCognixQuery = (text: string): string => {
  return text.replace(/@cognix/gi, "").trim();
};

// Convert conversation history to Gemini format
const convertToGeminiFormat = (
  history: { role: "user" | "assistant"; content: string }[]
): ChatMessage[] => {
  return history.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));
};

// Get AI response from Gemini with streaming
export const getCognixResponseStream = async (
  userMessage: string,
  conversationHistory: { role: "user" | "assistant"; content: string }[] = [],
  onChunk: (chunk: string) => void,
  onComplete: (fullResponse: string) => void,
  onError: (error: string) => void
): Promise<void> => {
  if (!GEMINI_API_KEY) {
    console.error("Gemini API key not configured");
    onError(
      "I'm not configured yet. Please add the VITE_GEMINI_API_KEY to enable AI responses. 🔧"
    );
    return;
  }

  try {
    // Build conversation with system instruction
    const contents: ChatMessage[] = [
      // Add system prompt as first user message with model acknowledgment
      { role: "user", parts: [{ text: COGNIX_SYSTEM_PROMPT }] },
      { role: "model", parts: [{ text: "Understood! I'm Cognix, ready to help! 😊" }] },
      // Add conversation history
      ...convertToGeminiFormat(conversationHistory.slice(-10)),
      // Add current user message
      { role: "user", parts: [{ text: userMessage }] },
    ];

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}&alt=sse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Gemini API error:", response.status, errorData);

      if (response.status === 400) {
        onError("Invalid request. Please try again! 🙏");
        return;
      }
      if (response.status === 403) {
        onError("API key invalid or quota exceeded. Please check your Gemini API key. 🔑");
        return;
      }
      if (response.status === 429) {
        onError("Too many requests. Please try again in a moment! ⏳");
        return;
      }

      onError("Sorry, I couldn't process that request. Please try again! 🙏");
      return;
    }

    // Handle streaming response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";

    if (!reader) {
      onError("Failed to initialize stream reader");
      return;
    }

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);

          try {
            const parsed = JSON.parse(data);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;

            if (text) {
              fullResponse += text;
              onChunk(text);
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    }

    if (fullResponse) {
      onComplete(fullResponse);
    } else {
      onError("I received an empty response. Please try again! 🤔");
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    onError(
      "Sorry, I'm having trouble connecting right now. Please try again later! 🔄"
    );
  }
};

// Non-streaming fallback
export const getCognixResponse = async (
  userMessage: string,
  conversationHistory: { role: "user" | "assistant"; content: string }[] = []
): Promise<string> => {
  return new Promise((resolve) => {
    let result = "";
    getCognixResponseStream(
      userMessage,
      conversationHistory,
      (chunk) => {
        result += chunk;
      },
      (fullResponse) => {
        resolve(fullResponse);
      },
      (error) => {
        resolve(error);
      }
    );
  });
};

// Cognix AI user info
export const COGNIX_USER = {
  uid: "cognix-ai",
  username: "Cognix",
  avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=cognix&backgroundColor=6366f1",
};
