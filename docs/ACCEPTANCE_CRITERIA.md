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

\- \[ ] API responses are runtime validated.

\- \[ ] Missing optional fields do not crash the application.

\- \[ ] Source publication time is displayed.

\- \[ ] Stale data is detected.

\- \[ ] Stale data is excluded from scoring.

\- \[ ] API requests have timeout and error handling.

\- \[ ] Tests do not call live government APIs.



\## Location



\- \[ ] User can grant browser location permission.

\- \[ ] Precise location is not permanently stored.

\- \[ ] Denied permission does not break the application.

\- \[ ] A one-tap district fallback is available.

\- \[ ] No address or long text input is required.

\- \[ ] A Hong Kong-wide fallback is available.



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



\## Scoring



\- \[ ] Scoring logic is independent from UI components.

\- \[ ] Scoring rules are deterministic.

\- \[ ] Severe warnings override normal scoring.

\- \[ ] Missing warning data prevents an overly positive recommendation.

\- \[ ] General outing mode has unit tests.

\- \[ ] Exercise mode has unit tests.

\- \[ ] Laundry mode has unit tests.

\- \[ ] Explanations identify the factors that changed the score.



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



\## Privacy



\- \[ ] No login exists.

\- \[ ] No analytics are enabled by default.

\- \[ ] No precise location is sent to analytics or stored in a database.

\- \[ ] No API key or secret is required.

