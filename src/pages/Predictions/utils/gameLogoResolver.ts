// Reusable resolver for picking a game logo from GameLogos by tags, with fallback

// Load all game logos at build time via Vite glob
const logoModules = import.meta.glob('../GameLogos/*.{png,jpg,jpeg,svg,webp}', {
  eager: true,
  as: 'url'
}) as Record<string, string>;

function normalizeTag(value: string): string {
  return value
    .toUpperCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Build map of normalized filename -> URL and capture fallback
const logoMap: Record<string, string> = {};
let fallbackLogoUrl: string | null = null;
for (const [path, url] of Object.entries(logoModules)) {
  const fileName = path.split('/').pop() || '';
  const base = fileName.replace(/\.[^.]+$/, '');
  const normalized = normalizeTag(base.replace(/[-_]/g, ' '));
  logoMap[normalized] = url;
  if (!fallbackLogoUrl && /(^|\/)gaminglogo\.(png|jpe?g|webp|svg)$/i.test(path)) {
    fallbackLogoUrl = url;
  }
}

// Add specific mappings for common tag variations
const tagMappings: Record<string, string> = {
  'LEAGUE_OF_LEGENDS': 'LOL',
  'CALL_OF_DUTY': 'CALLOFDUTY', 
  'BATTLEFIELD_6': 'BATTLEFIELD',
  'GTA_VI': 'GTA6'
};

// Apply tag mappings to the logo map
for (const [tagKey, imageKey] of Object.entries(tagMappings)) {
  const imageUrl = logoMap[imageKey];
  if (imageUrl) {
    logoMap[tagKey] = imageUrl;
  }
}

export function resolveLogoByTags(tags: string[] | undefined | null): string | null {
  if (Array.isArray(tags)) {
    for (const raw of tags) {
      if (!raw) continue;
      const key = normalizeTag(String(raw));
      const candidate = logoMap[key];
      if (candidate) return candidate;
    }
  }
  return fallbackLogoUrl;
}


// Server-based resolver for umbrella icons using Firebase Storage
// Constructs URLs for images stored in Firebase Storage with pattern: ic_<umbrellaId>.*
const FIREBASE_STORAGE_BASE_URL = 'https://firebasestorage.googleapis.com/v0/b/leveluptrades-46ac9.firebasestorage.app/o/umbrellas%2F';

export function resolveUmbrellaIconById(umbrellaId?: string): string | null {
  if (!umbrellaId) return null;
  
  // Return the most common format first (png), let the component handle fallback
  return `${FIREBASE_STORAGE_BASE_URL}ic_${umbrellaId}.png?alt=media`;
}

// Enhanced resolver with priority: Game logo → Fallback
// Note: Server images are handled at component level with error fallback
export function resolveLogoWithPriority(umbrella: any, tags: string[] | undefined | null): string | null {
  // Check for game logo based on tags
  const gameLogo = resolveLogoByTags(tags);
  if (gameLogo) {
    return gameLogo;
  }
  
  // Fallback to game controller image (already handled by resolveLogoByTags)
  return fallbackLogoUrl;
}

export function collectTagsFromUmbrella(umbrella: any): string[] {
  const collected: string[] = [];
  const children: any[] | undefined = umbrella && (umbrella as any).children;
  if (!Array.isArray(children)) return collected;
  for (const child of children) {
    const tags: string[] | undefined = child && (child as any).tags;
    if (Array.isArray(tags)) {
      for (const t of tags) {
        if (t != null) collected.push(String(t));
      }
    }
  }
  return collected;
}


