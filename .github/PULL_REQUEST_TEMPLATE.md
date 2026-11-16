<!-- Thank you for contributing to Numina! Please read CONTRIBUTING.md first. -->

## What does this PR do?

<!-- One or two sentences: what problem does it solve, and why this way? -->

## Checklist

- [ ] `pnpm lint` passes
- [ ] `pnpm exec tsc --noEmit` passes
- [ ] `pnpm test` passes (CI runs all three, but green locally saves a round-trip)
- [ ] New `/api/*` endpoints go through `handleRequest` (guard) + Zod validation
- [ ] Money is integer cents end-to-end — no floats, no string amounts
- [ ] No network calls, cloud services, or external assets added (local-first invariant)
- [ ] `README.md` / `DATABASE.md` updated if this changes documented behavior
- [ ] No real financial data anywhere in this PR (no `data/` files, masked screenshots)
