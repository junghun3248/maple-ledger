import './sites-env.mjs';

process.env.MAPLE_HOSTING = 'cloudflare';
process.argv = [process.execPath, 'vinext', 'build'];
await import('../node_modules/vinext/dist/cli.js');
