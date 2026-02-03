import { NextResponse } from "next/server";

const isAllowedHost = (url: URL) => {
  return (
    url.hostname === "res.cloudinary.com" ||
    url.hostname.endsWith(".cloudinary.com")
  );
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing url." }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid url." }, { status: 400 });
  }
  if (!isAllowedHost(parsed)) {
    return NextResponse.json({ error: "Host not allowed." }, { status: 400 });
  }

  const response = await fetch(parsed.toString());
  if (!response.ok) {
    return NextResponse.json({ error: "Failed to fetch media." }, { status: 502 });
  }
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const arrayBuffer = await response.arrayBuffer();
  return new NextResponse(arrayBuffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=600",
    },
  });
}
