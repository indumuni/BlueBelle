# Example data (illustrative)

Sample S3 objects and DynamoDB items matching [data-model.md](../data-model.md) and the `Manifest` / `Chunk`
schemas in [contracts/superlens.openapi.yaml](../contracts/superlens.openapi.yaml).

**The values are invented.** Option names are placeholders; the real names and value format come from the
provider CSV recorded in spike T001. The 12-character hashes in chunk file names are made up and are **not**
the SHA-256 of the file contents. Tests that check hashing must compute them, not read them from here.

When `apps/superlens-go` is scaffolded, this folder moves to `apps/superlens-go/testdata/examples/`, where it
seeds the file-backed store (`SUPERLENS_STORE=file://…`) and the handler tests.

## Layout

```text
testdata/
├── s3/                                   # mirrors the data bucket's keys
│   └── data/v1/                          # served by CloudFront /data/v1/* (v1: every series, no private prefix)
│       ├── manifest.json                 # all series and their chunk URLs
│       └── series/
│           ├── australiansuper.high-growth/2026.a3f9c2e81b04.json   # option, daily % returns
│           ├── frankfurter.aud-usd/2026.0c5e19a7f3d2.json           # FX, USD per 1 AUD
│           └── yahoo.gspc/2026.7d01be44c9a2.json                    # S&P 500 price levels (visibility: private, not enforced in v1)
└── dynamodb/
    ├── items.json                        # plain JSON, one object per item (easy to read)
    └── batch-write.json                  # same items in DynamoDB typed format for table bb-superlens-go-dev
```

## What each DynamoDB item shows

| PK / SK | Entity |
|---|---|
| `SOURCE#<id>` / `META` | DataSource: visibility, last success/error, backfill state |
| `SOURCE#<id>` / `SERIES#<seriesId>` | Series catalogue entry |
| `OWNER` / `WATCH#<seriesId>` | Watchlist entry (invested / considering) |
| `OWNER` / `PREFS` | UI preferences (period, currency view, comparison series) |
| `RUNS` / `RUN#<ulid>` | Update run: a `partial` run where the FX source failed and its data was left unchanged |
| `LOCK` / `UPDATE` | Update lock with lease and last finish time |

## Loading into a real table (dev only)

`batch-write.json` holds 12 items. `batch-write-item` takes at most 25 per call, so one call is enough:

```sh
aws dynamodb batch-write-item --request-items file://testdata/dynamodb/batch-write.json
```

Only do this against a `dev` stage table you're willing to overwrite.
