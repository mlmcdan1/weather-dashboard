export const fetchAiWeatherAdvice = async (description: string, temp: number) => {
  try {
    const response = await fetch("/api/ai-advice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ description, temp }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      const message = errorPayload?.error || "AI advice request failed.";
      throw new Error(message);
    }

    const data = (await response.json()) as { advice?: string };
    const advice = data.advice?.trim();
    return advice && advice.length > 0 ? advice : "No AI advice available.";
  } catch (error) {
    console.error("Error fetching AI weather advice:", error);
    return "AI advice unavailable.";
  }
};
