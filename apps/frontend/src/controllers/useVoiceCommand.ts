import { useCallback, useState } from "react";
import { apiClient } from "../services/apiClient";

interface VoiceCommandResponse {
  summary?: string;
  mission?: unknown;
}

export const useVoiceCommand = () => {
  const [isSending, setIsSending] = useState(false);
  const [lastSummary, setLastSummary] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const sendCommand = useCallback(async (utterance: string) => {
    setIsSending(true);
    setError(undefined);
    try {
      const response = await apiClient.post<VoiceCommandResponse>("/voice/command", { utterance });
      setLastSummary(response?.summary);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    } finally {
      setIsSending(false);
    }
  }, []);

  return { sendCommand, isSending, lastSummary, error };
};
