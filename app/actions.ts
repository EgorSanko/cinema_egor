"use server";

import { getMoviesByGenre, getPopularMovies, searchMovies, searchTV, getPopularTV, getTVByGenre } from "@/lib/tmdb";

export async function fetchMoreRelatedMovies(genreId: number, page: number) {
  return await getMoviesByGenre(genreId, page);
}

export async function fetchMoviesByGenreAction(genreId: number, page: number) {
  return await getMoviesByGenre(genreId, page);
}

export async function fetchMoviesBySearchAction(query: string, page: number) {
  return await searchMovies(query, page);
}

export async function fetchPopularMoviesAction(page: number) {
  return await getPopularMovies(page);
}

export async function fetchTVBySearchAction(query: string, page: number) {
  return await searchTV(query, page);
}

export async function fetchPopularTVAction(page: number) {
  return await getPopularTV(page);
}

export async function fetchTVByGenreAction(genreId: number, page: number) {
  return await getTVByGenre(genreId, page);
}
