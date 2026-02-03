import { NextResponse } from "next/server";
import { ensureSchema, getSql } from "@/lib/db";

type InsightPayload = {
  summary: string;
  related_ids: string[];
};

const parseInsight = (text: string): InsightPayload | null => {
  if (!text) return null;
  try {
    return JSON.parse(text) as InsightPayload;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as InsightPayload;
    } catch {
      return null;
    }
  }
};

export async function POST() {
  const fallbackSummary = "当下还在慢慢铺开，不必急着下结论。";
  let rows: {
    id: string;
    content: string | null;
    mood: string | null;
    created_at: string;
  }[] = [];
  try {
    await ensureSchema();
    const sql = getSql();
    rows = (await sql`
      SELECT id, content, mood, created_at
      FROM records
      WHERE created_at >= (now() - interval '30 days')
      ORDER BY created_at DESC
      LIMIT 15
    `) as unknown as {
      id: string;
      content: string | null;
      mood: string | null;
      created_at: string;
    }[];

    const apiKey = process.env.BAILIAN_API_KEY;
    const appId = process.env.BAILIAN_INSIGHT_APP_ID || process.env.BAILIAN_APP_ID;
    if (!apiKey || !appId) {
      return NextResponse.json(
        { error: "Missing BAILIAN_API_KEY or BAILIAN_APP_ID." },
        { status: 500 }
      );
    }

    const recordsForPrompt = rows.map((item) => ({
      id: item.id,
      content: (item.content || "").slice(0, 200),
      mood: item.mood || "",
      created_at: item.created_at,
    }));

    const prompt = `你是一个温和、不评判的观察者。请基于以下记录，生成两部分结果：
1) summary：一句话轻量自我观察提示（不超过28个字，语气温柔、非评判）。
2) related_ids：与summary最相关的记录id数组（最多6个，必须来自给定记录id）。

请严格输出JSON，字段为 summary 和 related_ids，不要输出多余文字。

记录列表：
${JSON.stringify(recordsForPrompt, null, 2)}`;

    const fallbackRelated = rows.slice(0, 3).map((item) => item.id);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(
        `https://dashscope.aliyuncs.com/api/v1/apps/${appId}/completion`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input: { prompt },
            parameters: {},
            debug: {},
          }),
          signal: controller.signal,
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return NextResponse.json({
          summary: fallbackSummary,
          relatedIds: fallbackRelated,
          records: rows,
          fallback: true,
        });
      }

      const text =
        data?.output?.text ||
        data?.output?.result ||
        data?.output?.content ||
        "";
      const parsed = parseInsight(text);
      const summary = parsed?.summary || fallbackSummary;
      const relatedIds = Array.isArray(parsed?.related_ids)
        ? parsed.related_ids
        : fallbackRelated;

      return NextResponse.json({
        summary,
        relatedIds,
        records: rows,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return NextResponse.json(
      {
        summary: fallbackSummary,
        relatedIds: rows.slice(0, 3).map((item) => item.id),
        records: rows,
        fallback: true,
        error: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 200 }
    );
  }
}
