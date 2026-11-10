# Contributing to Findora

Thanks for helping improve Findora. Open an issue for significant changes before implementing them.

## Local setup

Requires **Node.js 20+**. No external npm packages are currently required.

```bash
npm ci
npm start
```

Open <http://localhost:3000>. Demo mode is available without credentials.

## Quality checks

```bash
npm run ci
```

- Add or update tests for behavior changes (`tests/*.test.js`).
- Keep live API keys on the server, never in frontend files, logs or commits.
- Treat prices and delivery times as unverified unless confirmed by a retailer.
- Do not scrape merchants without confirming authorization and terms.
- Test responsive UI changes at both desktop and mobile widths.
- Keep pull requests focused and explain how changes were tested.

## Working with Git

Create a feature branch, make your change, run checks, then open a pull request.

```bash
git switch -c feature/short-description
npm run ci
git add .
git commit -m "Describe the change"
```

For security vulnerabilities, follow [SECURITY.md](SECURITY.md) rather than filing a public issue.
