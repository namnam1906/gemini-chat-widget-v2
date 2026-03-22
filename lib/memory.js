export function normalizeHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) {
    return [];
  }

  return rawHistory
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const role = item.role === "assistant" ? "assistant" : "user";
      const text = typeof item.text === "string" ? item.text.trim() : "";
      return { role, text };
    })
    .filter((item) => item.text.length > 0);
}

export function trimHistory(history, maxMessages = 10) {
  if (!Array.isArray(history)) {
    return [];
  }

  if (maxMessages <= 0) {
    return [];
  }

  return history.slice(-maxMessages);
}

export function toGeminiContents(history = []) {
  return history.map((item) => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.text }]
  }));
}

export function prepareConversationMemory(rawHistory, maxMessages = 10) {
  const normalized = normalizeHistory(rawHistory);
  const trimmed = trimHistory(normalized, maxMessages);
  const geminiContents = toGeminiContents(trimmed);

  return {
    normalized,
    trimmed,
    geminiContents
  };
}