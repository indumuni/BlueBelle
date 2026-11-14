# Feature Specification: Super Investment Option Tracker

**Feature Branch**: `003-super-option-tracker`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "I use AustralianSuper as my Super provider. AustralianSuper publish daily rates as a service (e.g. https://www.australiansuper.com//api/graphs/dailyrates/download/?start=01/07/2026&end=31/10/2026&cumulative=False&superType=super&truncateDecimalPlaces=True&outputFilename=Daily_latest_20261031.csv) where you give the start date and end date and save the file. Daily I download this file for the period I want and draw graphs to understand the behaviour of the individual investment options, especially the ones I have invested in and am interested in investing in. Tracking these helps me decide when to switch investment options. I also use the ASX All Ordinaries graph to compare against these. Storing the data I retrieve every time (past investment option data, ASX All Ordinaries index data, anything I may need in future) should improve performance and give a better experience. The graphs I draw through Claude are not great. Only the missing delta should be fetched, not the full set every time a graph is needed. Maybe name the app AustralianSuperVisualizer — suggest a good name."

## Clarifications

### Session 2026-11-12

- Context from owner: a key goal is to keep adding analysis tools that compare super performance against
  other investments and support calculated switching decisions, so the tracker must be extensible.
- Q: Which other investments might future tools compare super options against? → A: Anything with a daily
  price or return history (other funds, ETFs, shares, indices, cash rates); v1 also loads international
  indices for the USA, UK and emerging markets alongside the ASX All Ordinaries.
- Q: Should overseas indices be shown in their own currency, converted to AUD, or both? → A: Both; a
  per-chart switch between local currency and AUD, with daily AUD exchange rates stored as series.
- Q: How far back should the first load go for each series? → A: As far back as each source publishes
  (one-off full backfill, then daily updates).
- Q: Besides the tracker's own screens, how should future tools get at the stored data? → A: A documented,
  owner-only, read-only data interface for scripts, notebooks and Claude, in addition to screens and CSV
  export.
- Owner input during planning: general market data that is not about the owner should be publicly viewable
  (it is cheap to serve from a cache); the owner's own data and all actions stay private. Series whose
  source terms do not allow republishing stay private. FR-016 and SC-001a updated accordingly.
- Owner decision during planning (2026-11-13), **supersedes the public/private split above for v1**: the
  tracker is for the owner's personal use and its address is not shared, so v1 has **no sign-in and no access
  keys**. All screens, data and the data interface are open to anyone with the address. Before the tracker is
  shared publicly, the owner will add access control or switch restricted data to licensed sources (see
  "Before going public" in Assumptions). FR-015a/b, FR-016 and SC-001a/b updated accordingly.
- Q: Should the AUD view convert each day's value using that day's exchange rate, rather than today's rate?
  → A: Yes; each date uses its own rate (or the most recent earlier rate, up to 5 days back), never today's
  rate for all dates.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep a local history of daily option rates (Priority: P1)

As the fund member, I want the tracker to keep its own history of AustralianSuper's published daily rates
for every investment option, and to bring it up to date by fetching only the days it does not have yet,
so that I never have to download and re-assemble CSV files by hand again.

**Why this priority**: Every other story depends on having a complete, trustworthy history. It also
removes the daily manual download, which is the most repetitive part of today's routine.

**Independent Test**: Start with an empty history, run the initial load, then run an update the next
business day and confirm only the new day(s) were requested and the stored history
matches the provider's published file for the same period.

**Acceptance Scenarios**:

1. **Given** no stored history, **When** I run the initial load, **Then** daily rates for every published
   investment option, from the earliest date the provider publishes up to the latest published day, are
   stored.
2. **Given** stored history up to a certain day, **When** I run an update, **Then** only the days after
   the last stored day (plus a short re-check window, see FR-005) are requested from the provider.
3. **Given** stored history that is already current, **When** I run an update, **Then** nothing new is
   stored and I am told the data is already up to date.
4. **Given** the provider is unreachable, **When** I run an update, **Then** the existing history is left
   untouched and I am told when the data was last successfully updated.
5. **Given** it is 7:00 Sydney time on any day, **When** the scheduled update runs, **Then** history is
   brought up to date without me doing anything, and the result is visible the next time I open the tracker.
6. **Given** the scheduled update failed, **When** I open the tracker, **Then** I see that it failed and can
   press Refresh to try again.

---

### User Story 2 - Chart and compare my investment options (Priority: P1)

As the fund member, I want to pick investment options (defaulting to my watchlist) and a period and see
clear charts of how they performed, so I can understand their behaviour without building graphs myself.

**Why this priority**: Better charts are the visible payoff of the tracker and the main reason for
building it; together with Story 1 it forms the MVP.

**Independent Test**: With a known stored history, select two options and a period and check that the
chart's figures match values calculated independently from the published daily rates.

**Acceptance Scenarios**:

1. **Given** stored history, **When** I select one or more options and a period, **Then** I see a chart of
   each option's cumulative return over that period, all starting from the same baseline so they can be
   compared directly.
2. **Given** a chart is shown, **When** I switch to the daily view, **Then** I see each option's daily
   return for every day in the period.
3. **Given** a chart is shown, **When** I point at a day, **Then** I see the date and each option's value
   on that day.
4. **Given** a chart is shown, **When** I choose a preset period (1 week, 1 month, 3 months, 6 months,
   financial year to date, 1 year, 3 years, all), **Then** the chart redraws for that period without
   fetching anything from the provider.
5. **Given** a selected period, **When** I look at the summary, **Then** I see for each option its total
   return, best day, worst day and largest fall from a previous high within the period.

---

### User Story 3 - Compare against market indices (Priority: P2)

As the fund member, I want market indices stored alongside the option rates and shown on the same chart,
so I can see whether an option is moving with or against the Australian and international markets.
v1 comparison series: ASX All Ordinaries (Australia), S&P 500 (USA), FTSE 100 (UK) and MSCI Emerging
Markets.

**Why this priority**: Part of today's analysis, but option-only charts are already useful without it.

**Independent Test**: With stored option and comparison-series history, chart one option with the All
Ordinaries and the S&P 500 over a month and verify each index line's cumulative change matches that index's
published closing levels.

**Acceptance Scenarios**:

1. **Given** stored comparison-series history, **When** I add one or more comparison series to a chart,
   **Then** each one's cumulative change is drawn on the same baseline as the selected options.
2. **Given** a trading day for one series with no value for another (different market holidays), **When**
   the chart is drawn, **Then** each line shows only its own data and no line is shifted onto the wrong date.
3. **Given** I run an update, **When** a comparison series is behind, **Then** only its missing days are
   fetched, the same way as option rates.
4. **Given** a chart with the S&P 500 shown in local currency, **When** I switch the chart to AUD, **Then**
   the S&P 500 line is redrawn as its change for an Australian-dollar investor, and the chart states which
   currency view is active.

---

### User Story 4 - Maintain a watchlist (Priority: P2)

As the fund member, I want to mark the options I am invested in and the ones I am considering, so that
charts and summaries open on the options I care about.

**Why this priority**: Saves selecting the same options every morning, but charts work without it.

**Independent Test**: Add two options as "invested" and one as "considering", reopen the tracker, and
confirm the default chart shows exactly those three, labelled by group.

**Acceptance Scenarios**:

1. **Given** the list of known options, **When** I mark an option as invested or considering, **Then** it
   is remembered across sessions.
2. **Given** a watchlist, **When** I open the tracker, **Then** the default chart shows the watchlist
   options over the last-used period.
3. **Given** an option on my watchlist stops being published, **When** I open the tracker, **Then** it is
   still shown with its history up to its last published day and is flagged as no longer published.

---

### User Story 5 - Morning snapshot (Priority: P3)

As the fund member, I want a one-glance summary each morning of how my watchlist options and the comparison
series moved over the last day, week and month, so I can quickly decide whether anything needs a closer look.

**Why this priority**: Convenience on top of Stories 1–4.

**Independent Test**: With history current to yesterday, open the snapshot and check each figure against
values calculated from the stored data.

**Acceptance Scenarios**:

1. **Given** current history, **When** I open the snapshot, **Then** I see for each watchlist option and
   each comparison series the latest daily, 1-week and 1-month change, and the date of the latest data.
2. **Given** the data is stale (not updated since the last business day), **When** I open the snapshot,
   **Then** I am clearly warned that the figures are not current.

---

### Edge Cases

- Weekends and public holidays: no rates are published. An update on those days must not be treated as an
  error and must not keep re-requesting those dates. The provider's file lists those days with a 0 return for
  every option; they are not real returns and are not stored or shown as 0% days.
- The provider usually publishes a day's rate after that day ends; requesting today before publication
  must not store an empty or partial day.
- The provider may revise recently published rates; the re-check window (FR-005) replaces revised values.
- A new investment option appears: it is added automatically, with history from its first published day.
- An option is renamed: treated as a new option unless the provider's identifier stays the same; the old
  name's history is kept.
- The provider's file is malformed, empty, or its columns change: the update fails without storing any
  part of that response, and the reason is reported.
- The requested period is longer than the provider allows in one request: the request is split into
  smaller periods automatically.
- Series disagree on trading days (e.g. a state holiday, US or UK market holidays): handled as in Story 3,
  scenario 2.
- Overseas markets close on a different calendar day in Sydney time: each value is stored against its own
  market's trading date, never shifted to the Sydney date.
- An exchange rate is missing for a series' date in the AUD view: the most recent earlier rate is used; if
  none exists within 5 days, that point is left out and the gap is noted on the chart.
- One comparison source fails while others succeed: the successful sources are stored and the failed one is
  reported, without blocking the rest.
- A period is selected for which some options have no data: those options are shown only from their first
  available day, and this is noted on the chart.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST store AustralianSuper's published daily rates for every investment option of the
  "super" (accumulation) product, keyed by option and date.
- **FR-002**: System MUST, on the first load of any series (including series added later), backfill as far
  back as its source publishes. The backfill MUST be resumable: if interrupted, the next run continues from
  where it stopped instead of starting again.
- **FR-003**: System MUST, on update, request from the provider only the dates after the latest stored date
  (plus the re-check window), never the full history.
- **FR-004**: System MUST store each fetched day at most once per option; re-fetching a day replaces, never
  duplicates, its value.
- **FR-005**: System MUST re-check the most recent 5 business days on every update and replace any values
  the provider has revised.
- **FR-006**: System MUST store daily closing levels of the v1 comparison series (ASX All Ordinaries, S&P 500,
  FTSE 100, MSCI Emerging Markets) and update them with the same "missing days only" rule.
- **FR-006a**: System MUST treat investment options and comparison series as the same kind of thing (a named
  daily series from a data source), so that charts, summaries and updates work for any series.
- **FR-006b**: Adding a new data source or series (e.g. another fund's options, an ETF, a share, a cash rate)
  MUST NOT require changing or reloading the history already stored for existing series.
- **FR-006c**: Each series MUST record its market, currency and whether its values are levels/prices or
  returns, and charts MUST label a series' currency when it is not AUD.
- **FR-006d**: System MUST store daily AUD exchange rates for every currency used by a stored series (v1: USD
  and GBP) as series, updated with the same "missing days only" rule.
- **FR-006e**: Users MUST be able to switch each chart between local-currency and AUD views; in the AUD view,
  non-AUD series are converted using the exchange rate for the same date (or the most recent earlier rate
  when none was published that day), never a single current rate applied to all dates, so that the AUD view
  includes the effect of currency movements. The default view is AUD.
- **FR-007**: System MUST leave stored data unchanged when an update fails, and MUST record and show the time
  of the last successful update for each data source.
- **FR-008**: System MUST bring the data up to date both automatically, once every morning at 7:00 Sydney
  time, and on demand when the owner presses Refresh. A manual refresh while an update is already running
  MUST NOT start a second one.
- **FR-009**: Users MUST be able to chart one or more options, and optionally comparison series, over a preset or
  custom period, as cumulative return from a common baseline and as daily returns.
- **FR-010**: Users MUST be able to see exact values for any day on a chart.
- **FR-011**: System MUST show, for each charted series and period, total return, best day, worst day and
  largest fall from a previous high.
- **FR-012**: Charts and summaries MUST be produced from stored data only, without contacting the provider.
- **FR-013**: Users MUST be able to mark options as "invested" or "considering", and the watchlist MUST
  persist across sessions.
- **FR-014**: System MUST flag options that are no longer published while keeping their history.
- **FR-015**: Users MUST be able to export the stored history for selected options and a period as a CSV
  file.
- **FR-015a**: System MUST provide a documented, read-only data interface for other tools (scripts,
  notebooks, AI assistants), usable without credentials in v1, that can: list series with their attributes; return a series' values for a date
  range, optionally converted to AUD; and report each source's last successful update. The interface MUST be
  defined as a published contract before it is built.
- **FR-015b**: The data interface MUST NOT allow changing stored data or the watchlist, other than a single
  "request refresh" action subject to FR-008's one-update-at-a-time rule.
- **FR-016**: System MUST be hosted online so the owner can use it from any device, including a phone browser,
  without signing in. In v1 every screen, series, the watchlist, refresh and the data interface are
  available to anyone with the address; the address is not published. Each series still records whether its
  source allows republishing (visibility), so access control can be added later without data changes.
- **FR-016b**: Adding stored data outside the normal update (the owner-assisted import fallback) MUST NOT be
  possible through the public address; it requires the owner's own cloud credentials.
- **FR-016a**: Charts and summaries MUST be readable and usable on a phone-sized screen.
- **FR-017**: System MUST NOT give buy, sell or switch recommendations; it presents data and calculations only.
- **FR-018**: System MUST avoid putting unnecessary load on the provider: at most one update run at a time and
  no automatic retries more often than once every few minutes.

### Key Entities

- **Investment Option**: A fund option published by AustralianSuper (e.g. "Balanced", "High Growth").
  Attributes: provider name/identifier, product type ("super"), first and last published dates, still
  published or not.
- **Daily Rate**: An option's published return for one date. Attributes: option, date, rate, when it was
  fetched, whether it was revised.
- **Data Source**: Where a group of series comes from (e.g. AustralianSuper daily rates, an index provider).
  Each source has its own update schedule state and last successful update time.
- **Series**: Any named daily history from a data source. Investment options are series from the
  AustralianSuper source; comparison series are indices (and, later, ETFs, other funds, cash rates).
  Attributes: source, name, kind (option / index / exchange rate / other), market, currency, value type
  (return or level), visibility (public or private, inherited from the source's republishing terms).
- **Index Level**: A comparison series' closing level for one trading date in its own market.
- **Watchlist Entry**: An option the owner follows, with its group ("invested" or "considering").
- **Update Run**: A record of one data refresh: source, period requested, days added or revised, outcome,
  and time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a normal morning the owner sees an up-to-date chart of their watchlist within 5 seconds of
  opening the tracker, on a computer or phone, with no manual file download or refresh.
- **SC-001a**: Nobody can add or replace stored data through the public address. Repeated refresh requests
  from anyone start at most one update every 5 minutes.
- **SC-001c**: Heavy anonymous traffic to public pages and data (e.g. a flood of requests) does not raise the
  monthly bill above the budget alert threshold and does not stop the owner using the tracker.
- **SC-001b**: A new analysis script can list the series and fetch 10 years of one series' daily values using
  only the interface documentation and no credentials, in a single request taking under 3 seconds.
- **SC-002**: A routine daily update requests no more than the missing days plus the 5-day re-check window,
  regardless of how much history is stored.
- **SC-003**: Changing period, options or chart type redraws in under 2 seconds with full history stored
  (assume at least 25 years of daily data per series).
- **SC-004**: For any option and period, the cumulative return shown matches a value calculated by hand from
  the provider's published daily rates to within 0.01 percentage points.
- **SC-005**: Stored history has no gaps on business days for which the provider published rates, and no
  duplicate days.
- **SC-006**: After two weeks of use the owner no longer uses manual downloads or ad-hoc graphs for their
  morning check.

## Assumptions

- Single owner, personal use: no accounts, sign-in or multi-user features in v1. The address is shared with
  nobody, so open access is acceptable. Known risks accepted for v1: anyone who obtains the address can view
  all data (including index data whose source forbids republishing), change the watchlist, and press Refresh
  (rate-limited by FR-008/FR-018).
- **Before going public** (out of scope for v1): add owner sign-in for the watchlist and refresh; either put
  restricted series behind sign-in or replace them with licensed sources; re-check each source's terms.
- Hosting should cost only a few dollars a month at single-user volumes and be fully removable.
- If the provider has not yet published the previous day's rate at 7:00, that day is picked up by the next
  manual refresh or the next morning's run; no extra retries are scheduled in v1.
- Data covers only the "super" (accumulation) product. Pension / choice income options are out of scope for
  v1, but storage should not prevent adding them later.
- The provider's daily rate is a daily percentage return per option (the file requested with
  `cumulative=False`); cumulative returns are calculated by compounding these daily returns.
- The provider's download service remains publicly accessible without login, as it is today.
- Free, publicly available sources of daily closing levels exist for the v1 comparison series; choosing them
  is part of planning.
- Full history is small (tens of series × ~25 years × ~260 days), so storing all of it has negligible cost.
- No personal account data (balances, contributions, member number) is stored; only which options the owner
  follows.
- Other super funds, ETFs, shares and cash rates are out of scope for v1 data loading, but FR-006a/FR-006b
  make adding them a matter of adding a data source.
- Business days follow the provider's publishing calendar; the tracker learns it from the data rather than
  from a holiday list.
