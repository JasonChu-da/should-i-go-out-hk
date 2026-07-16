\# Official API Sources



Only use official Hong Kong government data sources.



Do not replace them with weather.com, OpenWeather, Google Maps or another

third-party provider.



\## Hong Kong Observatory



\### Current weather report



GET:



https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread\&lang=tc



Expected information may include:



\- district rainfall

\- regional temperature

\- humidity

\- UV index

\- weather icon

\- special weather tips

\- update time



\### Weather warning summary



GET:



https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum\&lang=tc



Use this as the main structured warning source.



Do not infer the absence of warnings when the request fails.



\### Local weather forecast



GET:



https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=flw\&lang=tc



Use forecast text only as supporting context.



Do not make fragile decisions using arbitrary keyword matching without tests.



\### Official documentation



https://www.hko.gov.hk/tc/weatherAPI/doc/files/HKO\_Open\_Data\_API\_Documentation\_tc.pdf



\## Air Quality Health Index



\### Current AQHI by monitoring station



GET:



https://dashboard.data.gov.hk/api/aqhi-individual?format=json



Expected fields currently include:



\- station

\- aqhi

\- health\_risk

\- publish\_date



Always validate `publish\_date`.



If the data is stale, show it as unavailable and exclude it from scoring.



Official dataset page:



https://data.gov.hk/en-data/dataset/hk-dpo-datagovhk2-city-dashboard-aqhi



\## Phase 2: rainfall nowcast



The Hong Kong Observatory provides gridded rainfall nowcast data for up to the

next two hours.



Do not implement it in the MVP.



Before implementing it, document:



\- file format

\- update frequency

\- grid coordinate system

\- conversion from user latitude/longitude to grid cell

\- missing-data behaviour

\- test fixtures



Official dataset page:



https://data.gov.hk/en-data/dataset/hk-hko-rss-gridded-rainfall-nowcast-in-hong-kong



\## Implementation rules



\- Fetch government APIs through server-side routes.

\- Set request timeouts.

\- Parse and validate responses.

\- Never assume optional fields exist.

\- Preserve raw timestamps.

\- Convert displayed times to Hong Kong time.

\- Add a server-side cache to avoid unnecessary repeated requests.

\- Automated tests must use local fixtures, not live API calls.

\- Record the retrieval time separately from the source publication time.

