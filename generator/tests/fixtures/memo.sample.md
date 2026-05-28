# Sample finance memo (sanitized)

Sanitized fixture. NOT real numbers. Used by memo-parser tests.

## Assets

| Account         |    Balance | Account Type | Owner  | Custodian   | UUID                                 | Growth % | Notes           |
| --------------- | ---------: | ------------ | ------ | ----------- | ------------------------------------ | -------: | --------------- |
| Sample Checking |   5,000.00 | checking     | sample | Sample Bank | 11111111-1111-1111-1111-111111111111 |      0.0 | Operating cash  |
| Sample Savings  |  25,000.00 | savings      | sample | Sample Bank | 22222222-2222-2222-2222-222222222222 |      3.5 | Emergency fund  |
| Sample TSP      | 500,000.00 | investment   | sample | TSP         | 33333333-3333-3333-3333-333333333333 |      7.0 | Lifecycle L2040 |

## Income Picture (Monthly)

| Source  | Amount | Start   | End     | Notes          |
| ------- | -----: | ------- | ------- | -------------- |
| Salary  | 12,000 | 2026-01 | 2026-07 | Pre-retirement |
| Pension |  6,500 | 2026-08 | never   | FERS           |

## Milestones

(Prose section — parser intentionally ignores this and reads structured
sections only. The narrative here is for humans and AI advisors, not the parser.)
