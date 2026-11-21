import type { MetadataRoute } from 'next';
export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/hunting', '/hunting/live', '/boss', '/income', '/hexa', '/feedback'].map(
    (path) => ({
      url: 'https://maple-ledger.meso-sg.workers.dev' + path,
    }),
  );
}
