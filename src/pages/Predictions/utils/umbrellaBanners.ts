// Dynamic resolver for umbrella banners using Vite's import.meta.glob
// Looks for any file in src/img named like: b_<umbrellaId>_anything.(webp|jpg|jpeg|png|svg)

// From this file (src/pages/Predictions/utils), the relative path to src/img is ../../../img
const bannerModules = import.meta.glob('../../../img/b_*.{webp,jpg,jpeg,png,svg}', { eager: true });

type EagerModule = { default?: string } | string;

export function resolveUmbrellaBannerById(umbrellaId?: string): string | null {
  if (!umbrellaId) return null;

  const prefix = `b_${umbrellaId}_`;

  for (const [key, mod] of Object.entries(bannerModules)) {
    // key looks like '../../../img/b_<id>_<name>.ext'
    const fileName = key.split('/').pop() || '';
    if (fileName.startsWith(prefix)) {
      const url = (mod as EagerModule);
      if (typeof url === 'string') return url;
      if (url && typeof (url as any).default === 'string') return (url as any).default as string;
      return null;
    }
  }

  return null;
}


