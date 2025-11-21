import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_MODEL_ID = "HuggingFaceTB/SmolLM3-3B";

const encodeModelIdForUrl = (modelId: string) =>
  modelId
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const HF_MODEL_ID =
  process.env.HF_MODEL_ID?.trim() && process.env.HF_MODEL_ID.trim().length > 0
    ? process.env.HF_MODEL_ID.trim()
    : DEFAULT_MODEL_ID;

const HUGGING_FACE_CHAT_COMPLETIONS_URL = `https://router.huggingface.co/hf-inference/models/${encodeModelIdForUrl(
  HF_MODEL_ID
)}/v1/chat/completions`;

const SYSTEM_PROMPT = [
  "You are the user's upbeat best friend who knows the weather.",
  "Return 2-3 short sentences that read like a quick plan:",
  "Today: what to do or how it feels now.",
  "Later: what changes to expect later today.",
  "Wear: one clear clothing/gear tip.",
  "Stay under 45 words, no lists, no fluff, no thinking steps, no tags—just the friendly tip.",
].join(" ");

type ResponseProfile = {
  id: string;
  instruction: string;
};

const RESPONSE_PROFILES: ResponseProfile[] = [
  {
    id: "layering",
    instruction:
      "Prioritize wardrobe guidance. Mention how to layer or adjust clothing from the cool morning to the later part of the day.",
  },
  {
    id: "enjoyment",
    instruction:
      "Highlight an enjoyable activity or small plan that fits the weather, noting why the conditions make it appealing.",
  },
  {
    id: "comfort-care",
    instruction:
      "Give a comfort or self-care tip—hydration, sunscreen, wind protection, or similar—tying it directly to the forecast.",
  },
  {
    id: "on-the-go",
    instruction:
      "Offer a quick on-the-go suggestion, such as what to keep in your bag or car so the weather never catches you off guard.",
  },
];

const pickResponseProfile = () =>
  RESPONSE_PROFILES[Math.floor(Math.random() * RESPONSE_PROFILES.length)];

const cleanAiContent = (input: string) => {
  const withoutTags = removeTaggedSections(input, ["think", "reasoning"]).replace(/<\/?[^>]+>/g, "");
  const cleaned = withoutTags
    .split("\n")
    .map((line) => line.replace(/^Assistant\s*:/i, "").replace(/^AI\s*:/i, "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  return cleaned;
};

const buildPrompt = (description: string, temp: number, profile: ResponseProfile) =>
  [
    `Current conditions: ${description || "unknown"}.`,
    `Temperature now: ${Math.round(temp)}°F.`,
    `Style focus: ${profile.instruction}`,
    "Answer in the Today / Later / Wear mini-format described in the system prompt.",
  ].join("\n");

const removeTaggedSections = (text: string, tags: string[]) => {
  return tags.reduce((current, tag) => {
    const pattern = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    return current.replace(pattern, "");
  }, text);
};

const extractAdvice = (
  userPrompt: string,
  rawAdvice: string | undefined,
  { description, temp }: { description?: string; temp?: number }
) => {
  if (!rawAdvice) {
    return "No AI advice available.";
  }

  let cleanedAdvice = cleanAiContent(rawAdvice);

  cleanedAdvice = cleanedAdvice.replace(/<\/?[^>]+>/g, "").trim();

  if (cleanedAdvice.startsWith(userPrompt)) {
    cleanedAdvice = cleanedAdvice.replace(userPrompt, "").trim();
  }

  if (cleanedAdvice.includes("---")) {
    cleanedAdvice = cleanedAdvice.split("---")[0]?.trim() ?? cleanedAdvice;
  }

  const adviceSentences = cleanedAdvice
    .split(/[\n.!?]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const isMetaSentence = (sentence: string) => {
    const normalized = sentence.toLowerCase();
    const metaFragments = [
      "user wants",
      "let me think",
      "user asks",
      "request",
      "instruction",
      "tip only",
      "ai forecast",
      "ai insight",
      "ai response",
      "let's tackle",
      "let us tackle",
      "they need",
      "they want",
    ];

    return (
      metaFragments.some((fragment) => normalized.includes(fragment)) ||
      normalized.startsWith("ai ") ||
      normalized.startsWith("assistant")
    );
  };

  const sentencesWithLetters = adviceSentences.filter((sentence) =>
    /[a-z]/i.test(sentence)
  );

  const filteredSentences = sentencesWithLetters.filter(
    (sentence) =>
      !isMetaSentence(sentence) && !/^\d+\s*°f?$/i.test(sentence.trim())
  );

  const selectedSentences = (
    filteredSentences.length > 0 ? filteredSentences : sentencesWithLetters
  ).slice(0, 2);

  const combinedAdvice = selectedSentences
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(". ");

  if (combinedAdvice) {
    return combinedAdvice.endsWith(".") ? combinedAdvice : `${combinedAdvice}.`;
  }

  const fallback = cleanedAdvice.slice(0, 220).trim();
  if (fallback) {
    return fallback.endsWith(".") ? fallback : `${fallback}.`;
  }

  const safeTemp = Number.isFinite(temp ?? NaN) ? Math.round(temp!) : null;
  const safeDesc = description?.trim() || "the weather right now";
  const templated =
    `Today: ${safeDesc}. ` +
    `Later: Keep an eye on shifting skies. ` +
    `Wear: ${safeTemp ? `Layer for around ${safeTemp}°F and keep a light jacket handy.` : "Layer up and keep a light jacket handy."}`;

  return templated.trim();
};

export async function POST(request: Request) {
  try {
    const { description, temp } = (await request.json()) as {
      description?: string;
      temp?: number;
    };

    if (typeof description !== "string" || typeof temp !== "number") {
      return NextResponse.json(
        { error: "Invalid payload for AI advice request." },
        { status: 400 }
      );
    }

    const token =
      process.env.HF_API_KEY ?? process.env.NEXT_PUBLIC_HF_API_KEY ?? "";

    if (!token.trim()) {
      console.error("Missing Hugging Face API key.");
      return NextResponse.json(
        { error: "AI service is not configured." },
        { status: 500 }
      );
    }

    const trimmedToken = token.trim();

    const invalidChar = [...trimmedToken].find(
      (char) => char.charCodeAt(0) > 0xff
    );

    if (invalidChar) {
      console.error(
        `Invalid Hugging Face API key character code detected: ${invalidChar.charCodeAt(
          0
        )}.`
      );
      return NextResponse.json(
        {
          error:
            "AI service misconfigured. Please re-enter the Hugging Face API key without smart quotes or ellipsis.",
        },
        { status: 500 }
      );
    }

    const responseProfile = pickResponseProfile();
    const userPrompt = buildPrompt(description, temp, responseProfile);

    const hfResponse = await fetch(HUGGING_FACE_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${trimmedToken}`,
      },
      body: JSON.stringify({
        model: HF_MODEL_ID,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 220,
        temperature: 0.7,
        top_p: 0.95,
      }),
    });

    if (!hfResponse.ok) {
      const payload = await hfResponse.text();
      console.error("Hugging Face response error:", hfResponse.status, payload);

      if (hfResponse.status === 404) {
        return NextResponse.json(
          {
            error:
              "Configured model is not available via the Hugging Face Inference Providers API.",
            details: `Requested model: ${HF_MODEL_ID}. Update the HF_MODEL_ID env var to one of the router-supported models (e.g. HuggingFaceTB/SmolLM3-3B).`,
            providerResponse: payload,
          },
          { status: 502 }
        );
      }

      return NextResponse.json(
        { error: "AI request failed.", details: payload },
        { status: hfResponse.status === 401 ? 502 : hfResponse.status }
      );
    }

    const data = (await hfResponse.json()) as {
      choices?: Array<{
        message?: { role?: string; content?: string };
        delta?: { content?: string };
      }>;
    };

    const rawAdvice =
      data.choices?.[0]?.message?.content ??
      data.choices?.[0]?.delta?.content ??
      "";

    console.log("HF advice debug", {
      profile: responseProfile.id,
      prompt: userPrompt,
      rawAdvice,
      providerPayload: data,
    });

    const advice = extractAdvice(userPrompt, rawAdvice, { description, temp });

    return NextResponse.json({ advice });
  } catch (error) {
    console.error("Unexpected AI advice error:", error);
    return NextResponse.json(
      { error: "Unexpected error retrieving AI advice." },
      { status: 500 }
    );
  }
}
