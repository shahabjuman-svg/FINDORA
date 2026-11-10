# Deployment guide

Findora is a **Node.js web server**, not a static HTML-only site. GitHub Pages alone will not serve its `/api/*` endpoints. Deploy it to a host that can run a Node.js process.

## Deploy to a Node.js hosting provider

1. Push the repository to GitHub.
2. Connect the repository to your host as a **Web Service** (not a static site).
3. Select a current supported Node.js release (20+; 22 recommended).
4. Set the install/build command to `npm ci` if your host requires one.
5. Set the start command to `npm start`.
6. Let the host set `PORT` automatically, or configure `PORT` to match its requirements.
7. Optionally add `SERPAPI_API_KEY` as a **private environment variable** in the host's dashboard.
8. Enable HTTPS and confirm `/api/health` returns `{"ok":true}`.

The app listens on `0.0.0.0`, so most Node application hosts can route external traffic to it.

## Environment configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | Listening port, defaults to `3000`. |
| `SERPAPI_API_KEY` | No | Enables SerpApi-based live shopping discovery. Without it, the app uses demo mode. |

Do not expose the SerpApi key through client-side build variables or commit it to GitHub.

## Production-readiness limitations

A deployed MVP is **not the same as production-ready shopping aggregation**. Before serving public traffic, add distributed rate limiting and caching, logging and monitoring, explicit privacy guidance, quota controls, retailer source compliance checks, and address-level delivery validation wherever supported.
