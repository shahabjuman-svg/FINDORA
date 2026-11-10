# Testing

## Fast automated checks

```bash
npm ci
npm run ci
```

`npm run ci` runs syntax checks for frontend and backend JavaScript, followed by the Node built-in test suite. The tests cover natural-language parsing, demo matching, result normalization, HTTP endpoints, safety headers, upstream failures and rate limiting.

Run them separately:

```bash
npm run check
npm test
```

## GitHub Actions

The workflow in `.github/workflows/ci.yml` runs on pushes, pull requests, and manual dispatch. It tests Node.js 20 and 22 using the committed `package-lock.json`. No API key is needed and it makes no paid shopping-provider requests.

## Optional browser smoke test

There is also `scripts/browser_smoke_test.py`, which requires a Python environment with **Playwright** and a compatible Chromium browser installed. On platforms where the Playwright-managed browser is not available, you may point `CHROMIUM_PATH` to a Chromium executable. Start `npm start` separately, then run:

```bash
python scripts/browser_smoke_test.py
```

The browser test uses fixture data and exercises desktop/mobile layout, search, filters, saved products and comparison. It is **not part of the default GitHub Actions workflow** because it needs additional browser dependencies.

## Manual pre-release checklist

- [ ] Search for an exact product name and a natural-language request.
- [ ] Check empty, no-match, long and special-character searches.
- [ ] Verify filtering and sorting combinations.
- [ ] Verify saved products and compare behavior.
- [ ] Test phone and desktop widths plus keyboard access.
- [ ] Ensure demo offers remain clearly labeled as fictional.
- [ ] Ensure unknown delivery dates are not presented as guaranteed.
- [ ] If live mode is enabled, inspect real offers and verify merchant destination / pricing independently.
