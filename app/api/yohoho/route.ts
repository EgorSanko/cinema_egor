import { NextRequest, NextResponse } from 'next/server';

const TMDB_API_KEY = '275c9d09780aadb4b13ff57a731eda00';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') || '';
  const tmdbId = searchParams.get('tmdb_id') || '';

  let ruTitle = title;
  let imdbId = '';

  // Fetch Russian title and IMDB ID from TMDB
  if (tmdbId) {
    try {
      const [detailsRes, ruRes] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`),
        fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=ru-RU`),
      ]);
      if (detailsRes.ok) {
        const details = await detailsRes.json();
        imdbId = details.imdb_id || '';
      }
      if (ruRes.ok) {
        const ruData = await ruRes.json();
        if (ruData.title) ruTitle = ruData.title;
      }
    } catch (e) {}
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; width: 100vw; height: 100vh; }
    #yohoho { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="yohoho"
    data-title="${ruTitle.replace(/"/g, '&quot;')}"
    ${imdbId ? 'data-imdb="' + imdbId.replace(/"/g, '&quot;') + '"' : ''}
  ></div>
  <script src="//yohoho.cc/yo.js"></script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
