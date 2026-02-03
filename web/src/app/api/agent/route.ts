import { NextResponse } from "next/server";

type AgentRequest = {
  prompt: string;
  sessionId?: string;
  fileList?: string[];
};

const parseAgentText = (payload: any) => {
  const output = payload?.output ?? payload?.result ?? payload?.data ?? payload;
  if (typeof output === "string") return output;
  return (
    output?.text ||
    output?.content ||
    output?.result ||
    output?.choices?.[0]?.message?.content ||
    output?.choices?.[0]?.text ||
    ""
  );
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AgentRequest;
    const prompt = body?.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    const apiKey = process.env.BAILIAN_API_KEY;
    const appId = process.env.BAILIAN_APP_ID;
    if (!apiKey || !appId) {
      return NextResponse.json(
        { error: "Missing BAILIAN_API_KEY or BAILIAN_APP_ID." },
        { status: 500 }
      );
    }

    const input: Record<string, unknown> = { prompt };
    if (body?.sessionId) {
      input.session_id = body.sessionId;
    }
    if (Array.isArray(body?.fileList) && body.fileList.length > 0) {
      input.file_list = body.fileList;
    }

    const response = await fetch(
      `https://dashscope.aliyuncs.com/api/v1/apps/${appId}/completion`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input,
          parameters: {},
          debug: {},
        }),
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.message || data?.error || "Agent request failed.", detail: data },
        { status: response.status }
      );
    }

    const text = parseAgentText(data);
    const sessionId = data?.output?.session_id ?? null;
    return NextResponse.json({ text: text || "", sessionId, raw: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 }
    );
  }
}
