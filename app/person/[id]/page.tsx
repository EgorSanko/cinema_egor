import { Navbar } from "@/components/navbar";
import { MovieCard } from "@/components/movie-card";
import { TVCard } from "@/components/tv-card";
import { getPersonDetails, profileUrl } from "@/lib/tmdb";
import Image from "next/image";
import { notFound } from "next/navigation";
import { User, Calendar, MapPin } from "lucide-react";
import type { Metadata } from "next";

interface PersonPageProps {
	params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PersonPageProps): Promise<Metadata> {
	const { id } = await params;
	const data = await getPersonDetails(parseInt(id));
	if (!data) return { title: "Персона не найдена" };
	return {
		title: `${data.details.name} — фильмография | sapkeflykino`,
		description: `Все фильмы и сериалы с участием ${data.details.name}`,
	};
}

export default async function PersonPage({ params }: PersonPageProps) {
	const { id } = await params;
	const data = await getPersonDetails(parseInt(id));
	if (!data || !data.details || !data.details.id) notFound();

	const { details, credits } = data;
	const cast = (credits.cast || []).filter((c: any) => c.poster_path).slice(0, 60);

	const movies = cast.filter((c: any) => c.media_type === "movie").map((m: any) => ({
		id: m.id, title: m.title, poster_path: m.poster_path,
		vote_average: m.vote_average, release_date: m.release_date,
		backdrop_path: m.backdrop_path, overview: m.overview, genre_ids: m.genre_ids || [],
	}));
	const series = cast.filter((c: any) => c.media_type === "tv").map((s: any) => ({
		id: s.id, name: s.name, poster_path: s.poster_path,
		vote_average: s.vote_average, first_air_date: s.first_air_date,
		backdrop_path: s.backdrop_path, overview: s.overview, genre_ids: s.genre_ids || [],
	}));

	const profile = profileUrl(details.profile_path, "w342");

	return (
		<>
			<Navbar />
			<main className="bg-background min-h-screen">
				<div className="max-w-7xl mx-auto px-4 py-12">

					{/* Header */}
					<section className="flex flex-col sm:flex-row gap-8 mb-12">
						<div className="w-48 sm:w-56 aspect-[2/3] relative rounded-xl overflow-hidden bg-card flex-shrink-0 mx-auto sm:mx-0">
							{profile ? (
								<Image src={profile} alt={details.name} fill className="object-cover" sizes="224px" />
							) : (
								<div className="w-full h-full flex items-center justify-center text-muted-foreground">
									<User size={64} />
								</div>
							)}
						</div>

						<div className="flex-1 space-y-4">
							<div>
								<h1 className="text-4xl font-bold text-foreground">{details.name}</h1>
								{details.known_for_department && (
									<p className="text-primary text-lg mt-1">{details.known_for_department}</p>
								)}
							</div>

							<div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
								{details.birthday && (
									<div className="flex items-center gap-1.5"><Calendar size={14} /> {new Date(details.birthday).toLocaleDateString("ru-RU")}</div>
								)}
								{details.place_of_birth && (
									<div className="flex items-center gap-1.5"><MapPin size={14} /> {details.place_of_birth}</div>
								)}
							</div>

							{details.biography && (
								<div>
									<h2 className="text-lg font-semibold text-foreground mb-2">Биография</h2>
									<p className="text-muted-foreground text-sm leading-relaxed line-clamp-6">
										{details.biography}
									</p>
								</div>
							)}
						</div>
					</section>

					{/* Filmography */}
					{movies.length > 0 && (
						<section className="mb-12">
							<h2 className="text-2xl font-bold text-foreground mb-4">🎬 Фильмы ({movies.length})</h2>
							<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
								{movies.map((m: any) => (
									<MovieCard key={m.id} movie={m} />
								))}
							</div>
						</section>
					)}

					{series.length > 0 && (
						<section className="mb-12">
							<h2 className="text-2xl font-bold text-foreground mb-4">📺 Сериалы ({series.length})</h2>
							<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
								{series.map((s: any) => (
									<TVCard key={s.id} show={s} />
								))}
							</div>
						</section>
					)}

					{movies.length === 0 && series.length === 0 && (
						<div className="text-center py-16 text-muted-foreground">
							Фильмография недоступна.
						</div>
					)}

				</div>
			</main>
		</>
	);
}
