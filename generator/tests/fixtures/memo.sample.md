# Sample finance memo (sanitized)

Sanitized fixture for tests. NOT real numbers — the values here are scaled
placeholders that exercise the parser's edge cases (`$X,XXX (date)`,
`~$Xk`, splits in notes, bold summary rows, inline tags).

Mirrors the real `jason_finance.md` shape: a 3-column Assets table
(`| Account | Balance | Notes |`) with optional `[key:value]` inline tags in
the Notes column for metadata that doesn't have its own column (type, status,
growth assumption, uuid, owner). Tags are optional everywhere; the parser
treats absent tags as null.

## Assets

| Account                                  | Balance                          | Notes                                                                                                          |
| ---------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Sample TSP (Lifecycle 50/50)             | $500,000 (12/31/2025)            | Traditional $250,000 / Roth $150,000 / Agency $80,000 / Auto 1% $20,000 [type:401k] [growth:0.07] [owner:self] |
| Sample Roth IRA (legacy) — ACCT12345     | $80,000                          | Past surrender period — rolling to Vanguard. [status:pending-out] [type:roth-ira]                              |
| Vanguard Roth (destination) — 1111111111 | $0                               | Awaiting transfer-in (~$80k) from Sample Roth IRA. [status:pending-in] [type:roth-ira]                         |
| Sample Savings                           | ~$50,000 @ 3.20%                 | Emergency fund + buffer. [type:savings] [growth:0.032]                                                         |
| Sample Checking                          | $20,000                          | Operating cash. [type:checking]                                                                                |
| Sample CDs                               | $70,000 total                    | See breakdown below                                                                                            |
| Sample Brokerage (inherited) — 22222222  | $10,000                          | Taxable. [type:brokerage] [owner:joint]                                                                        |
| Primary Home                             | Est. value ~$700k, equity ~$400k | Mortgage $300,000 @ 2.99%. [type:real-estate] [owner:joint]                                                    |
| Rental                                   | Est. value ~$600k, equity ~$600k | Paid off. [type:real-estate] [status:rental] [owner:joint]                                                     |
| **Total Liquid/Invested**                | **~$1,300,000**                  |                                                                                                                |

## Income Picture (Monthly)

| Source            | Amount                                | Notes          |
| ----------------- | ------------------------------------- | -------------- |
| Salary            | ~$10,000 (partial — some auto-routes) | Pre-retirement |
| Spouse            | ~$4,000 (verified via deposits)       | Stable         |
| Rental            | $2,000                                | Below market   |
| Interest          | ~$150                                 | Savings APR    |
| **Total tracked** | **~$16,150**                          |                |

## Milestones

(Prose section — parser intentionally ignores this and reads structured
sections only. The narrative here is for humans and AI advisors, not the
parser.)
