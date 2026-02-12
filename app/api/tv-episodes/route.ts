import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_TMDB_BASE_URL;
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const season = searchParams.get("season");

  if (!id || !season) {
    return NextResponse.json([], { status: 400 });
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/tv/${id}/season/${season}?api_key=${API_KEY}&language=ru-RU`,
      { next: { revalidate: 3600 } }
    );
    const data = await response.json();
    return NextResponse.json(data.episodes || []);
  } catch {
    return NextResponse.json([]);
  }
}
