import type { MetadataRoute } from 'next';
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    '/',
    '/hunting',
    '/boss',
    '/income',
    '/hexa',
    '/starforce',
    '/weapon-stats',
    '/feedback',
  ].map((path) => ({
    url: 'https://maple-ledger.meso-sg.workers.dev' + path,
  }));
}
