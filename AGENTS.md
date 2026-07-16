\# AGENTS.md



\## Project



This repository contains a mobile-first Traditional Chinese web application

called「香港現在適合出門嗎？」.



Before making changes, read:



1\. `docs/PRODUCT\_SPEC.md`

2\. `docs/API\_SOURCES.md`

3\. `docs/ACCEPTANCE\_CRITERIA.md`

4\. `PLANS.md`, if it exists



These documents are the source of truth.



\## Working method



\- Before implementation, inspect the repository and verify the external API

&#x20; response formats using real requests.

\- Maintain `PLANS.md` as an implementation checklist.

\- Work in small, testable phases.

\- Do not stop to ask about routine implementation choices.

\- Make the simplest reasonable decision and record important decisions in

&#x20; `docs/DECISIONS.md`.

\- Ask the user only when genuinely blocked or when a decision would

&#x20; substantially change the product scope.

\- Never claim a task is complete unless linting, tests and production build

&#x20; have passed.



\## Product constraints



\- No paid services.

\- No AI API.

\- No API keys.

\- No login or user accounts.

\- No database in the MVP.

\- No user text input.

\- Do not collect or permanently store precise user location.

\- Browser geolocation may only be used in memory for the current session.

\- Provide a one-tap district fallback when location permission is denied.

\- All user-facing text must be Traditional Chinese.

\- The interface must be mobile-first and usable with one hand.

\- Do not display raw meteorological terminology without a plain-language

&#x20; explanation.

\- Always display data source and last updated time.

\- Stale or unavailable data must never silently influence the score.



\## Technical expectations



\- Use Next.js with TypeScript.

\- Use server routes for external API requests to avoid coupling the browser

&#x20; directly to government data sources.

\- Keep API clients, parsers, scoring logic and UI components separate.

\- Validate external API responses at runtime.

\- Treat missing, malformed and stale fields as expected conditions.

\- Use deterministic rules for recommendations.

\- Keep the scoring function pure and covered by unit tests.

\- Prefer built-in platform features and existing dependencies.

\- Ask before adding a large production dependency.

\- Avoid unnecessary abstractions and premature optimization.



\## Quality requirements



After meaningful changes, run:



\- `npm run lint`

\- `npm test`

\- `npm run build`



Tests must not depend on live government APIs. Save sanitized API responses as

fixtures and use them in automated tests.



Test at minimum:



\- normal weather

\- rainfall

\- very hot weather

\- high UV

\- high AQHI

\- severe weather warning

\- missing API fields

\- stale API response

\- API request failure

\- geolocation denied



\## Git



\- Do not create commits unless explicitly requested.

\- At the end of each completed task, suggest a concise Git commit message.



\## Completion report



At the end of a task, report:



1\. What was implemented

2\. Files changed

3\. Commands executed

4\. Test and build results

5\. Known limitations

6\. Suggested next step

7\. Suggested commit message

