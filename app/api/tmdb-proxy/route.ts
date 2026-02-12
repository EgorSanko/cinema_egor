import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_TMDB_BASE_URL;
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");

  if (!path || !API_KEY) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  // Only allow specific safe paths
  const allowed = ["/movie/", "/tv/"];
  if (!allowed.some(a => path.startsWith(a))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  try {
    const sep = path.includes("?") ? "&" : "?";
    const response = await fetch(
      `${API_BASE_URL}${path}${sep}api_key=${API_KEY}&language=ru-RU`,
      { next: { revalidate: 3600 } }
    );
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
