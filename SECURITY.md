# Security policy

## Reporting vulnerabilities

Do **not** open a public GitHub issue for a vulnerability or disclose API credentials.
If this project is hosted on GitHub, use **Security → Advisories → Report a vulnerability** (if enabled), or contact the repository owner privately through an established channel.

## Supported versions

This is an MVP. Only the current `main` branch is actively maintained.
There is no formal security-patch SLA.

## Configuration and deployment

- Store `SERPAPI_API_KEY` in private server-side environment variables, never in Git or client-side JavaScript.
- `.env` is for local development and is ignored by Git.
- Do not include raw search URLs containing API keys in logs or screenshots.
- Restrict access to deployment secrets in your hosting provider.
- Use HTTPS and a reverse proxy / platform protections for public deployments.
- Current throttling and caching are in-memory, not coordinated across processes.
- Search results are third-party discovery data, not proof of delivery eligibility, pricing or stock.

Before production, perform a full security review covering public abuse controls, input validation, third-party integrations, monitoring, user data, and dependency management.
