# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/0xbabyalien/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/0xbabyalien/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast CSV reader, a drop-in replacement for csv-reader 1.0.0 — built for make.fun's "Read broken CSV files faster, 21 November 2026" bounty ($100 in USDC). See the bounty page: https://make.fun/bounty/csv-reader-speed-01-run-20261121

`solve.js` reads broken CSV files (mixed line endings, unclosed quotes, stray delimiters) and writes clean rows, 3–4× faster than the baseline on the practice set with 0 mismatches across 24,000 fuzz cases. `main.ts` is the entrypoint. Run with Node 22.
