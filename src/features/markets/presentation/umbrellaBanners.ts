// Server-based resolver for umbrella banners using Firebase Storage
// Constructs URLs for images stored in Firebase Storage with pattern: b_<umbrellaId>.*

const FIREBASE_STORAGE_BASE_URL =
	"https://firebasestorage.googleapis.com/v0/b/leveluptrades-46ac9.firebasestorage.app/o/umbrellas%2F";

export function resolveUmbrellaBannerById(umbrellaId?: string): string | null {
	if (!umbrellaId) return null;

	// Return the most common format first (jpg), let the component handle fallback
	// The component will try different extensions if this one fails
	return `${FIREBASE_STORAGE_BASE_URL}b_${umbrellaId}.jpg?alt=media`;
}
