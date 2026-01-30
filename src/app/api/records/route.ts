import { NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";

type RecordRow = {
  id: string;
  content: string | null;
  mood: string | null;
  images: string[] | null;
  videos: string[] | null;
  created_at: string;
};

export async function GET(request: Request) {
  await ensureSchema();
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");
  const keyword = searchParams.get("keyword")?.trim() ?? "";
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (mode === "stats") {
    const rows = await sql<
      { range: string; count: number }[]
    >`
      SELECT range, count
      FROM (
        SELECT '7d' as range, COUNT(*)::int as count
        FROM records
        WHERE created_at >= (now() - interval '7 days')
        UNION ALL
        SELECT '30d' as range, COUNT(*)::int as count
        FROM records
        WHERE created_at >= (now() - interval '30 days')
        UNION ALL
        SELECT '90d' as range, COUNT(*)::int as count
        FROM records
        WHERE created_at >= (now() - interval '90 days')
      ) t;
    `;
    const map = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.range] = row.count;
      return acc;
    }, {});
    return NextResponse.json({
      last7: map["7d"] ?? 0,
      last30: map["30d"] ?? 0,
      last90: map["90d"] ?? 0,
    });
  }

  const conditions = [];
  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push(sql`(content ILIKE ${like} OR mood ILIKE ${like})`);
  }
  if (start) {
    conditions.push(sql`created_at >= ${start}::date`);
  }
  if (end) {
    conditions.push(sql`created_at < (${end}::date + interval '1 day')`);
  }

  const whereClause =
    conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const rows = await sql<RecordRow[]>`
    SELECT id, content, mood, images, videos, created_at
    FROM records
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT 200;
  `;

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      content: row.content ?? "",
      mood: row.mood ?? "",
      images: row.images ?? [],
      videos: row.videos ?? [],
      createdAt: row.created_at,
    }))
  );
}

export async function POST(request: Request) {
  await ensureSchema();
  const body = await request.json();
  const content = typeof body.content === "string" ? body.content : "";
  const mood = typeof body.mood === "string" ? body.mood : "";
  const images = Array.isArray(body.images) ? body.images : [];
  const videos = Array.isArray(body.videos) ? body.videos : [];

  const rows = await sql<RecordRow[]>`
    INSERT INTO records (content, mood, images, videos)
    VALUES (${content}, ${mood || null}, ${sql.json(images)}, ${sql.json(videos)})
    RETURNING id, content, mood, images, videos, created_at;
  `;

  const row = rows[0];

  return NextResponse.json({
    id: row.id,
    content: row.content ?? "",
    mood: row.mood ?? "",
    images: row.images ?? [],
    videos: row.videos ?? [],
    createdAt: row.created_at,
  });
}

export async function DELETE(request: Request) {
  await ensureSchema();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  await sql`DELETE FROM records WHERE id = ${id};`;
  return NextResponse.json({ ok: true });
}
