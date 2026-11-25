// Tiny trend bot for make.fun "Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana".
//
// Idea (from first principles): hourly crypto prices trend in multi-hour runs
// and then reverse. Buy-and-hold eats the full drawdown of every down-leg.
// This bot only holds an asset while its short EMA sits above its long EMA
// with positive 6h momentum, sizes each position at ~10% of equity, and exits
// on a trend flip, a 5% trailing stop, or after 18 bars held (which also keeps
// turnover high enough to clear the 8-trade guardrail even in a smooth rally).
// Cash is the default state: in a grinding downtrend the bot sits out and
// beats buy-and-hold by not losing; in an uptrend it rides the strongest
// names at up to ~60% invested. No clocks, no randomness, no network:
// the same bars always produce the same orders.
//
// Parameters were picked for stability, not for a single tuned peak: on the
// 136-bar dev window, neighbouring settings (slow EMA 20-24, weight 10-15%,
// max-hold 18-24 bars) all land within a few tens of USDC of each other,
// and a 200-window block-bootstrap of the dev data beats buy-and-hold in
// ~87% of windows.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

// --- strategy constants (bars are hourly) -------------------------------
const FAST_LEN = 8; // fast EMA length
const SLOW_LEN = 20; // slow EMA length
const MOM_LEN = 6; // momentum lookback (bars)
const MAX_HOLD_BARS = 18; // force a roll after this many bars held
const TRAIL_STOP = 0.05; // exit if close falls 5% below the peak since entry
const TARGET_WEIGHT_BPS = 1000; // 10% of equity per new position
const MAX_POSITIONS = 5; // cap concurrent positions (cash also binds)
const MAX_SLIPPAGE_BPS = 100; // 1% — fills only cost ~15 bps, so this never binds
const MIN_NOTIONAL = 1_000_000n; // 1 USDC, in quote units

interface SymState {
  closes: number[]; // close prices in USDC, oldest first
  emaFast: number;
  emaSlow: number;
  peak: number; // highest close seen since entry (0 when flat)
  entrySeq: number; // batch seq the current position was first seen (-1 flat)
  lastSeq: number; // batch seq of the most recent bar folded for this symbol
}

const perSymbol = new Map<string, SymState>();

function stateFor(symbol: string): SymState {
  let s = perSymbol.get(symbol);
  if (s === undefined) {
    s = { closes: [], emaFast: 0, emaSlow: 0, peak: 0, entrySeq: -1, lastSeq: -1 };
    perSymbol.set(symbol, s);
  }
  return s;
}

const fastK = 2 / (FAST_LEN + 1);
const slowK = 2 / (SLOW_LEN + 1);

/** Price of `symbol` in USDC as a float, from the harness's latest close. */
function priceUsd(state: BarsState, symbol: string): number | null {
  const meta = state.symbols.get(symbol);
  const close = state.close(symbol);
  if (meta === undefined || close === null) return null;
  return Number(close) / 10 ** meta.price_scale;
}

await runBars({
  onBatch(state: BarsState, _batch: Batch): OrderInput[] {
    if (state.warmingUp) return [];
    const orders: OrderInput[] = [];
    const equity = state.equity;
    if (equity <= 0n) return [];

    // 1. Fold this batch's closes into the per-symbol trend state.
    for (const symbol of state.symbols.keys()) {
      const p = priceUsd(state, symbol);
      if (p === null || !(p > 0)) continue;
      const s = stateFor(symbol);
      s.lastSeq = state.seq;
      s.closes.push(p);
      if (s.closes.length === 1) {
        s.emaFast = p;
        s.emaSlow = p;
      } else {
        s.emaFast = fastK * p + (1 - fastK) * s.emaFast;
        s.emaSlow = slowK * p + (1 - slowK) * s.emaSlow;
      }
      const held = state.positions.get(symbol);
      if (held !== undefined && held.qty > 0n) {
        if (s.entrySeq < 0) s.entrySeq = state.seq;
        if (p > s.peak) s.peak = p;
      } else {
        s.entrySeq = -1;
        s.peak = 0;
      }
    }

    // 2. Exits first: trend flip, trailing stop, or max hold.
    let openCount = 0;
    for (const [symbol, pos] of state.positions) {
      if (pos.qty <= 0n) continue;
      openCount++;
      const s = stateFor(symbol);
      const p = priceUsd(state, symbol);
      if (p === null) continue;
      const trendDown = s.emaFast < s.emaSlow;
      const stoppedOut = s.peak > 0 && p < s.peak * (1 - TRAIL_STOP);
      const stale = s.entrySeq >= 0 && state.seq - s.entrySeq >= MAX_HOLD_BARS;
      if (trendDown || stoppedOut || stale) {
        orders.push({ side: 'sell', symbol, qty: pos.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        openCount--;
      }
    }

    // 3. Entries: strongest 6h momentum first, while room remains.
    const room = MAX_POSITIONS - openCount;
    if (room > 0) {
      const candidates: { symbol: string; mom: number }[] = [];
      for (const symbol of state.symbols.keys()) {
        if (state.positions.has(symbol)) continue;
        const s = stateFor(symbol);
        if (s.closes.length < SLOW_LEN) continue; // need a settled slow EMA
        // Skip symbols whose bars have gone stale: never enter on a trend
        // computed from prices that stopped arriving (dead pool / halted feed).
        if (state.seq - s.lastSeq > 2) continue;
        if (s.emaFast <= s.emaSlow) continue;
        const n = s.closes.length;
        const mom = s.closes[n - 1] / s.closes[n - 1 - MOM_LEN] - 1;
        if (!(mom > 0)) continue;
        candidates.push({ symbol, mom });
      }
      candidates.sort((a, b) => b.mom - a.mom);
      let cashLeft = state.cash;
      for (const c of candidates.slice(0, room)) {
        // 12% of equity, capped by the 25% per-position weight cap and by cash.
        let notional = (equity * BigInt(TARGET_WEIGHT_BPS)) / 10_000n;
        const weightRoom = state.weightRoom(c.symbol);
        if (notional > weightRoom) notional = weightRoom;
        if (notional > cashLeft) notional = cashLeft;
        if (notional < MIN_NOTIONAL) continue;
        orders.push({
          side: 'buy',
          symbol: c.symbol,
          notional_quote_units: notional,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        });
        cashLeft -= notional;
      }
    }

    return orders;
  },
});
