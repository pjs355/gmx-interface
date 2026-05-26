import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { RiSearchLine, RiCloseLine } from "react-icons/ri";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { isRestrictedProductionMode } from "@/config/restrictedMode";
import { resolveUmbrellaBannerById } from "@/features/markets/presentation/umbrellaBanners";
import { isCounterStrikeUmbrella } from "@/features/markets/presentation/umbrellaGame";
import "./Search.scss";

type SearchResponse = {
	success: boolean;
	data: Umbrella[];
};

type SearchProps = {
	onSearchActive?: (active: boolean, query: string) => void;
	searchResults?: Umbrella[];
	activeQuery?: string;
};

export function Search({ onSearchActive, searchResults, activeQuery }: SearchProps) {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<Umbrella[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [showDropdown, setShowDropdown] = useState(false);
	const searchRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
				setShowDropdown(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const searchUmbrellas = useCallback(
		async (searchQuery: string) => {
			if (!searchQuery.trim()) {
				setResults([]);
				setShowDropdown(false);
				if (onSearchActive) {
					onSearchActive(false, "");
				}
				return;
			}

			setIsLoading(true);
			try {
				const baseUrl = getPredictionApiBaseUrl();
				const response = await fetch(
					`${baseUrl}/umbrellas/search?q=${encodeURIComponent(searchQuery)}`,
				);

				if (!response.ok) {
					throw new Error("Search failed");
				}

				const data: SearchResponse = await response.json();
				console.log("Search results:", data);
				// Restricted production mode hides non-Counter-Strike umbrellas
				// from public discovery surfaces. The /umbrellas/search endpoint
				// returns every game; we filter client-side here so a Dota
				// search like "mongolz" cannot surface a non-CS2 result.
				const raw = data.data ?? [];
				const filtered = isRestrictedProductionMode()
					? raw.filter((u) => isCounterStrikeUmbrella(u as any))
					: raw;
				setResults(filtered);
				setShowDropdown(true);
			} catch (error) {
				console.error("error", error);
				setResults([]);
			} finally {
				setIsLoading(false);
			}
		},
		[onSearchActive],
	);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setQuery(value);
		searchUmbrellas(value);
	};

	const handleSearch = () => {
		if (query.trim() && results.length > 0 && onSearchActive) {
			onSearchActive(true, query);
			setShowDropdown(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			handleSearch();
		}
	};

	const handleClear = () => {
		setQuery("");
		setResults([]);
		setShowDropdown(false);
		if (onSearchActive) {
			onSearchActive(false, "");
		}
	};

	return (
		<div className="search-container" ref={searchRef}>
			<div className="search-input-wrapper">
				<RiSearchLine className="search-icon" />
				<input
					type="text"
					className="search-input"
					placeholder="Search markets..."
					value={query}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					onFocus={() => query && setShowDropdown(true)}
				/>
				{query && (
					<button className="search-clear" onClick={handleClear}>
						<RiCloseLine />
					</button>
				)}
			</div>

			{showDropdown && (
				<div className="search-results">
					{isLoading && <div className="search-loading">Searching...</div>}
					{!isLoading && results.length === 0 && (
						<div className="search-no-results">No markets found</div>
					)}
					{!isLoading && results.length > 0 && (
						<>
							<div className="search-results-header">
								{results.length} market
								{results.length !== 1 ? "s" : ""} found - Press Enter to filter
							</div>
							<ul className="search-results-list">
								{results.map((result) => {
									const umbrella = result as any;
									const eventDate =
										umbrella.eventDate || (umbrella.children && umbrella.children[0]?.eventDate);
									const imageUrl = umbrella.image || resolveUmbrellaBannerById(umbrella._id);
									return (
										<li
											key={result._id}
											className="search-result-item"
											onClick={() => {
												navigate(`/predictions/umbrella/${result._id}`);
												setQuery("");
												setResults([]);
												setShowDropdown(false);
											}}
										>
											{imageUrl && (
												<img
													src={imageUrl}
													alt={umbrella.displayName}
													className="search-result-image"
												/>
											)}
											<div className="search-result-content">
												<div className="search-result-title">
													{umbrella.displayName || umbrella.title}
												</div>
												{eventDate && (
													<div className="search-result-date">
														{new Date(eventDate).toLocaleDateString()}
													</div>
												)}
											</div>
										</li>
									);
								})}
							</ul>
						</>
					)}
				</div>
			)}

			{activeQuery && searchResults && (
				<div className="search-active-filter">
					<span className="search-filter-text">
						Searching for: <strong>{activeQuery}</strong> ({searchResults.length} result
						{searchResults.length !== 1 ? "s" : ""})
					</span>
					<button className="search-filter-clear" onClick={handleClear}>
						<RiCloseLine />
					</button>
				</div>
			)}
		</div>
	);
}
