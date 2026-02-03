import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

export const runtime = "nodejs";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  throw new Error("Cloudinary env vars are missing.");
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const allowedTypes = ["image", "video", "raw"] as const;
  type ResourceType = (typeof allowedTypes)[number];
  const resourceType = (form.get("resourceType") as string | null) ?? "image";
  const safeResourceType: ResourceType = allowedTypes.includes(
    resourceType as ResourceType
  )
    ? (resourceType as ResourceType)
    : "image";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const uploaded = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "bushi_myheart",
        resource_type: safeResourceType,
      },
      (error, result) => {
        if (error || !result) {
          reject(error);
          return;
        }
        resolve(result as { secure_url: string });
      }
    );
    stream.end(buffer);
  });

  return NextResponse.json({ url: uploaded.secure_url });
}
