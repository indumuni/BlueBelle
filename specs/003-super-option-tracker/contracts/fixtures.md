# Golden Calculation Fixtures (seam test, research R12)

Lives in `contracts/superlens/fixtures/*.json`. Go (`internal/calc`) and TypeScript (`src/lib/calc.ts`)
tests both load every file and must produce `expected` within `tolerance` (default 1e-6). These fixtures prove
SC-004 and keep the browser and the data interface in agreement.

## File shape

```json
{
  "name": "compounding-basic",
  "operation": "cumulative_return | period_stats | aud_convert | rebase",
  "input": { "...": "operation specific, see below" },
  "expected": { "...": "operation specific" },
  "tolerance": 1e-6
}
```

| Operation | Input | Expected |
|---|---|---|
| `cumulative_return` | `{ valueType: return_pct\|level, points: [[date, value]...], from, to }` | `{ totalReturnPct }` |
| `period_stats` | same | `{ totalReturnPct, bestDay, worstDay, maxDrawdownPct }` |
| `aud_convert` | `{ levels: [[date, v]...], fx: [[date, perAud]...] }` | `{ points: [[date, v]...], gaps: [date...] }` |
| `rebase` | `{ valueType, points, base: 100 }` | `{ points: [[date, indexValue]...] }` |

## Required cases

1. Compounding a few days by hand (e.g. +1%, −0.5%, +0.25% → +0.7462375%).
2. A range starting on a weekend or holiday (baseline = last business day before `from`).
3. A series that starts inside the range (stats from its first date).
4. A drawdown with recovery (max drawdown taken from the true peak).
5. A missing FX date filled from the previous rate; an FX gap longer than 5 days reported in `gaps`.
6. Different trading calendars (an S&P 500 holiday on an AU business day).
7. Real AustralianSuper data from the owner's sample `testdata/australian-super/Daily.csv`
   (2026-11-01 to 2026-11-12, 8 business days after dropping the 3 all-zero weekend rows), whole range:

   | Series | totalReturnPct | bestDay | worstDay | maxDrawdownPct |
   |---|---|---|---|---|
   | High Growth | 2.1118394 | 0.8855 | −0.2467 | −0.2572738 |
   | Balanced | 1.7649755 | 0.7003 | −0.1551 | −0.1551 |
   | Australian Shares | 3.2156545 | 2.3913 | −0.3016 | −0.3999759 |
   | International Shares | 3.5090491 | 1.5758 | −2.1104 | −2.1104 |
   | Diversified Fixed Interest | 0.2257108 | 0.2435 | −0.1422 | −0.3390250 |
   | Cash | 0.1640147 | 0.0396 | 0.0113 | 0 |

   Computed independently (Python, compounding ∏(1 + r/100) − 1 from a baseline of 1, which counts as the first
   peak). The fixture also checks that the all-zero rows are excluded: including them would leave the total
   unchanged but set Cash's `worstDay` to 0. Extend it with a full calendar year when the spike records one.
8. Currency effect: USD index +10% while AUD/USD falls 0.70 → 0.65 gives +18.46% in the AUD view (proves
   each date uses its own rate, not today's).
