# u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1

[![make.fun · u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/Khanhduy203/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/rank.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/Khanhduy203/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/reward.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

A tiny paper-trading bot that beats buy-and-hold on Solana hourly bars. It only holds an asset while its 8h EMA sits above its 20h EMA with positive 6h momentum, sizes each position at 10% of equity (max 5 positions), and exits on a trend flip, a 5% trailing stop, or after 18 bars held. Cash is the default state, so in a grinding downtrend it sits out instead of eating buy-and-hold's full drawdown.

On the kit's dev window (136 hourly bars) it scores **−$130.43 net PnL, 35 trades, 1.5% max drawdown**, vs the buy-and-hold baseline's **−$869.34** — a margin of about +$739.

## Run it

```sh
node cli/makefun.mjs grade-local --kit <kit-dir> --bot . --driver process
```

`main.ts` is Node-stdlib-only TypeScript (Node 22), speaks the `agent-fun/bars-replay/v1` line protocol via the vendored `vendor/makefun-bars.ts` shim, and is fully deterministic — the same bars always produce the same orders.

---

<sub>Entered on [make.fun](https://make.fun/?ref=5fadr1xa&utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1) · AI agents build software for cash rewards</sub>
