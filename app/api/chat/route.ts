import { NextRequest, NextResponse } from "next/server";

interface ChatRequest {
  message: string;
  context: string; // stats + filter + prior analysis memory
  history: { role: "user" | "assistant"; content: string }[];
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY is not configured on the server" }, { status: 500 });
  }

  const body: ChatRequest = await request.json();
  const { message, context, history } = body;

  if (!message.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const messages = [
    {
      role: "system" as const,
      content: `You are an elite quantitative trading analyst specialized in NASDAQ-100 (NDX) intraday patterns. You have deep expertise in gap analysis, candle structure, volatility clustering, and sequential patterns.

You have access to the following context about the user's data and prior analysis sessions:

${context}

INSTRUCTIONS:
- Answer the user's questions using ALL available context including prior analyses.
- When referencing prior analyses, note patterns that persist across different filters (these are robust).
- Be concise, data-driven, and precise. Use specific numbers when possible.
- If the user asks about something from a prior analysis, reference it by its filter description.
- You have FULL data access — never say you need more data.`,
    },
    ...history.map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user" as const, content: message },
  ];

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        temperature: 0.4,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json(
        { error: `DeepSeek API error: ${response.status} - ${err}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content ?? "No response.";

    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach DeepSeek API: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
