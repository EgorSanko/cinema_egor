"use client";

import { useEffect, useState } from "react";
import { Play, X } from "lucide-react";
import { getMovieVideos, getTVVideos, pickBestTrailer, type TmdbVideo } from "@/lib/tmdb";

interface TrailerButtonProps {
	mediaId: number;
	mediaType: "movie" | "tv";
	className?: string;
}

export function TrailerButton({ mediaId, mediaType, className }: TrailerButtonProps) {
	const [open, setOpen] = useState(false);
	const [trailer, setTrailer] = useState<TmdbVideo | null | undefined>(undefined);

	useEffect(() => {
		let cancelled = false;
		const fetcher = mediaType === "movie" ? getMovieVideos : getTVVideos;
		fetcher(mediaId).then(videos => {
			if (cancelled) return;
			setTrailer(pickBestTrailer(videos));
		});
		return () => { cancelled = true; };
	}, [mediaId, mediaType]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
		window.addEventListener("keydown", onKey);
		document.body.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", onKey);
			document.body.style.overflow = "";
		};
	}, [open]);

	// While loading or no trailer found — render nothing (don't show broken button)
	if (trailer === undefined) return null;
	if (trailer === null) return null;

	return (
		<>
			<button
				onClick={() => setOpen(true)}
				className={
					className ||
					"flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 text-white rounded-xl font-medium transition-colors"
				}
			>
				<Play size={18} fill="currentColor" />
				Трейлер
			</button>

			{open && (
				<div
					className="fixed inset-0 z-[10000] bg-black/90 flex items-center justify-center p-4"
					onClick={() => setOpen(false)}
				>
					<button
						onClick={() => setOpen(false)}
						className="absolute top-4 right-4 z-10 p-2 bg-black/60 hover:bg-black/80 rounded-full text-white"
						aria-label="Закрыть"
					>
						<X size={24} />
					</button>
					<div
						className="relative w-full max-w-5xl aspect-video"
						onClick={e => e.stopPropagation()}
					>
						<iframe
							src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0&modestbranding=1`}
							title={trailer.name}
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
							allowFullScreen
							className="w-full h-full rounded-xl bg-black"
						/>
					</div>
				</div>
			)}
		</>
	);
}
