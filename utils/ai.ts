export const fetchAiWeatherAdvice = async (description: string, temp: number) => {
  try {
    console.log("Fetching AI advice...");

    const userPrompt = `The weather is ${description} and the temperature is ${temp}°F. Provide a **very short and practical weather tip only**. ONLY return the tip, no explanation, no introduction, just the tip itself.`;

    const response = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_HF_API_KEY}`,
      },
      body: JSON.stringify({
        inputs: userPrompt,
        parameters: { max_new_tokens: 20 }, 
      }),
    });

    const data = await response.json();
    console.log("AI Raw Response:", data);

    let aiAdvice = data[0]?.generated_text?.trim() || "No AI advice available.";

    // ✅ Remove the input text from AI response
    if (aiAdvice.startsWith(userPrompt)) {
      aiAdvice = aiAdvice.replace(userPrompt, "").trim();
    }

    // ✅ Cut off any extra content after "---"
    if (aiAdvice.includes("---")) {
      aiAdvice = aiAdvice.split("---")[0].trim();
    }

    // ✅ Extract the first valid sentence and avoid prompt repeats with proper typing
    const adviceSentences: string[] = aiAdvice.split(".").map((sentence: string) => sentence.trim());

    // ✅ Find the first meaningful sentence that doesn't repeat the prompt
    aiAdvice = adviceSentences.find((sentence: string) => 
      sentence && !sentence.toLowerCase().includes("the weather is")
    ) || "No valid advice received.";

    // ✅ Add a period back if needed
    aiAdvice = aiAdvice.endsWith(".") ? aiAdvice : aiAdvice + ".";


    console.log("Extracted AI Advice:", aiAdvice);
    return aiAdvice;

  } catch (error) {
    console.error("Error fetching AI weather advice:", error);
    return "AI advice unavailable.";
  }
};
