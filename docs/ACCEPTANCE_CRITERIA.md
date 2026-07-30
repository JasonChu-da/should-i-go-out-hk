\# MVP Acceptance Criteria



The MVP is complete only when every required item below passes.



\## Project setup



\- \[ ] The application starts with one documented command.

\- \[ ] TypeScript strict mode is enabled.

\- \[ ] Linting passes.

\- \[ ] Unit tests pass.

\- \[ ] Production build passes.

\- \[ ] README contains local setup and deployment instructions.



\## Data



\- \[ ] Current HKO weather data can be retrieved.

\- \[ ] HKO warning data can be retrieved.

\- \[ ] AQHI data can be retrieved.

\- \[ ] HKO gridded rainfall nowcast CSV can be retrieved through the server route without a browser CORS dependency.

\- \[ ] API responses are runtime validated.

\- \[ ] Missing optional fields do not crash the application.

\- \[ ] Source publication time is displayed.

\- \[ ] Stale data is detected.

\- \[ ] Stale data is excluded from scoring.

\- \[ ] API requests have timeout and error handling.

\- \[ ] Tests do not call live government APIs.

\- \[ ] Nowcast parsing requires the exact official five-column header and four unique, contiguous half-hour periods.

\- \[ ] Nowcast timestamps are interpreted as Hong Kong time and periods remain anchored to source `updatedAt`.

\- \[ ] The server caches only 18 district × 4 periods plus four Hong Kong-wide derived values; a browser response contains only the selected four periods.

\- \[ ] The CSV stream enforces 5 MiB, 100,000-row and complete 8-second timeout limits.

\- \[ ] A nowcast older than 24 minutes is displayed as stale and never enters scoring.



\## Location



\- \[ ] User can grant browser location permission.

\- \[ ] Precise location is not permanently stored.

\- \[ ] Denied permission does not break the application.

\- \[ ] A one-tap district fallback is available.

\- \[ ] No address or long text input is required.

\- \[ ] A Hong Kong-wide fallback is available.

\- \[ ] Precise browser coordinates are still reduced to a canonical district id before any server request.

\- \[ ] Every district uses one deterministic nearest forecast grid point for all four periods.



\## Interface



\- \[ ] The first useful result is visible without scrolling on a typical phone.

\- \[ ] Score, verdict and recommendations are clearly visible.

\- \[ ] User can switch between all three activity modes with one tap.

\- \[ ] Loading state is understandable.

\- \[ ] Partial failure state is understandable.

\- \[ ] Complete failure state provides retry.

\- \[ ] Data source and update time are visible.

\- \[ ] The layout works at 360px width.

\- \[ ] The layout works on desktop.

\- \[ ] The interface supports dark mode.

\- \[ ] Status is not communicated through colour alone.

\- \[ ] The existing rainfall card separates past-hour observation from future rainfall without adding a fifth main card.

\- \[ ] Future copy shows actual remaining coverage, first contiguous rain window, source update time and an approximate—not over-precise—time range.

\- \[ ] Hong Kong-wide copy says “香港部分地區” or “十八區代表格點” and does not imply rain everywhere.

\- \[ ] Future-only rain does not switch the current WeatherScene to a rain scene.



\## Scoring



\- \[ ] Scoring logic is independent from UI components.

\- \[ ] Scoring rules are deterministic.

\- \[ ] Severe warnings override normal scoring.

\- \[ ] Missing warning data prevents an overly positive recommendation.

\- \[ ] General outing mode has unit tests.

\- \[ ] Exercise mode has unit tests.

\- \[ ] Laundry mode has unit tests.

\- \[ ] Explanations identify the factors that changed the score.

\- \[ ] Past-hour rainfall, structured nowcast and forecast text form one `rain-risk` factor and never stack rain deductions.

\- \[ ] Equal rain penalties resolve by explicit time, proximity, then nowcast → observation → forecast text.

\- \[ ] A partially elapsed first period is labelled as a full half-hour accumulation and is never prorated.

\- \[ ] Nowcast failure alone does not add an ignored factor, cap the score or force the Hero to “資料有限”.



\## Required test scenarios



\- \[ ] Normal weather

\- \[ ] Light rainfall

\- \[ ] Heavy rainfall

\- \[ ] Very hot weather

\- \[ ] High UV

\- \[ ] High AQHI

\- \[ ] Severe weather warning

\- \[ ] Stale AQHI

\- \[ ] Missing temperature

\- \[ ] Malformed API response

\- \[ ] One API unavailable

\- \[ ] All APIs unavailable

\- \[ ] Geolocation denied

\- \[ ] Valid and malformed rainfall nowcast CSV

\- \[ ] District grid mapping and Hong Kong-wide aggregation

\- \[ ] First contiguous rain window with a later separate rain period

\- \[ ] Partially elapsed period and reduced remaining coverage

\- \[ ] Stale, timeout, oversized and unavailable nowcast fallback

\- \[ ] Cross-source rain-risk penalty and tie-break rules



\## Privacy



\- \[ ] No login exists.

\- \[ ] No analytics are enabled by default.

\- \[ ] No precise location is sent to analytics or stored in a database.

\- \[ ] No API key or secret is required.

