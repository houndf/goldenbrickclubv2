import type { TRound, TTeam, TTie } from "./tournament";

/**
 * Lays out a tournament as a bracket picture.
 *
 * MLS-style (ties labelled EAST / WEST): East on the left, West on the right,
 * the final in the middle. Round One sits in seed order [1v8/9, 4v5, 2v7, 3v6],
 * so winners meet the way the real bracket does; the Wild Card hangs off the
 * 1-seed's matchup. Missing matchups are drawn as placeholders so the shape is
 * always complete.
 *
 * Anything else falls back to plain left-to-right columns, one per round.
 */

export const CARD_W = 148;
export const CARD_H = 72;
const COL_GAP = 30;
const ROW_GAP = 18;
const HEAD = 40;
const PAD = 16;

export type Conference = "EAST" | "WEST";

export interface BracketSlotTeam {
  code: string;
  name: string;
  seed: number | null;
}

export interface BracketNode {
  key: string;
  x: number;
  y: number;
  round: TRound;
  side: Conference | null;
  /** The real matchup, when it exists. */
  tie: TTie | null;
  /** What to show while the matchup isn't set yet. */
  placeholder: { a: BracketSlotTeam | null; b: BracketSlotTeam | null } | null;
}

export interface BracketEdge {
  from: string;
  to: string;
}

export interface BracketColumn {
  x: number;
  round: TRound;
  side: Conference | null;
}

export interface BracketLayout {
  width: number;
  height: number;
  nodes: BracketNode[];
  edges: BracketEdge[];
  columns: BracketColumn[];
}

const colX = (i: number) => PAD + i * (CARD_W + COL_GAP);
const rowY = (i: number) => HEAD + PAD + i * (CARD_H + ROW_GAP);
const between = (a: number, b: number) => (a + b) / 2;

const sideOf = (tie: TTie): Conference | null =>
  tie.label?.toUpperCase().startsWith("E") ? "EAST" : tie.label?.toUpperCase().startsWith("W") ? "WEST" : null;

const winnerOf = (tie: TTie | null | undefined): BracketSlotTeam | null => {
  if (!tie?.winner) return null;
  return tie.winner === "home"
    ? { ...tie.teamA, seed: tie.seedA }
    : { ...tie.teamB, seed: tie.seedB };
};

const hasTeam = (tie: TTie | null | undefined, code: string) =>
  Boolean(tie && (tie.teamA.code === code || tie.teamB.code === code));

/** Round One slot (0-3, top to bottom) from the seeds: 1v8, 4v5, 2v7, 3v6. */
export function roundOneSlot(tie: TTie): number | null {
  const seeds = [tie.seedA, tie.seedB].filter((s): s is number => s != null);
  if (seeds.length === 0) return null;
  const top = Math.min(...seeds);
  if (top === 1) return 0;
  if (top === 4) return 1;
  if (top === 2) return 2;
  if (top === 3) return 3;
  return null;
}

/** Fill numbered slots, honouring a preferred slot when free, else the next empty one. */
function place<T>(items: T[], size: number, prefer: (t: T) => number | null): (T | null)[] {
  const out: (T | null)[] = Array(size).fill(null);
  const rest: T[] = [];
  for (const item of items) {
    const p = prefer(item);
    if (p != null && p < size && out[p] === null) out[p] = item;
    else rest.push(item);
  }
  for (const item of rest) {
    const free = out.indexOf(null);
    if (free >= 0) out[free] = item;
  }
  return out;
}

export function isConferenceBracket(rounds: TRound[], ties: TTie[]): boolean {
  const n = rounds.length;
  return (n === 4 || n === 5) && ties.length > 0 && ties.some((t) => sideOf(t) !== null);
}

export function buildBracket(
  rounds: TRound[],
  ties: TTie[],
  opts: { topSeeds?: Partial<Record<Conference, TTeam>> } = {},
): BracketLayout {
  const sorted = [...rounds].sort((a, b) => a.number - b.number);
  return isConferenceBracket(sorted, ties) ? conferenceBracket(sorted, ties, opts.topSeeds ?? {}) : simpleBracket(sorted, ties);
}

function conferenceBracket(
  rounds: TRound[],
  ties: TTie[],
  topSeeds: Partial<Record<Conference, TTeam>>,
): BracketLayout {
  const hasWildCard = rounds.length === 5;
  const wc: TRound | null = hasWildCard ? rounds[0] : null;
  const [r1, sf, cf, fin] = hasWildCard ? rounds.slice(1) : rounds;
  const of = (r: TRound | null, side: Conference | null) =>
    r ? ties.filter((t) => t.roundId === r.id && (side === null || sideOf(t) === side)).sort((a, b) => a.slot - b.slot) : [];

  // Columns, left to right: [WC] R1 SF CF  FINAL  CF SF R1 [WC]
  const sideCols = hasWildCard ? 4 : 3;
  const roundsBySide = [wc, r1, sf, cf].filter((r): r is TRound => r !== null);
  const finalCol = sideCols;
  const colFor = (side: Conference, depth: number) =>
    side === "EAST" ? depth : finalCol * 2 - depth; // depth 0 = outermost

  const nodes: BracketNode[] = [];
  const edges: BracketEdge[] = [];
  const columns: BracketColumn[] = [];
  const ys = { r1: [0, 1, 2, 3].map(rowY) };
  const sfY = [between(ys.r1[0], ys.r1[1]), between(ys.r1[2], ys.r1[3])];
  const cfY = between(sfY[0], sfY[1]);

  const cfNodes: Partial<Record<Conference, string>> = {};
  const cfTies: Partial<Record<Conference, TTie | null>> = {};

  for (const side of ["EAST", "WEST"] as const) {
    let depth = 0;
    const short = side === "EAST" ? "E" : "W";
    for (const r of roundsBySide) columns.push({ x: colX(colFor(side, roundsBySide.indexOf(r))), round: r, side });

    // Wild Card: one matchup feeding the 1-seed's slot.
    const wcTie = of(wc, side)[0] ?? null;
    let wcKey: string | null = null;
    if (wc) {
      wcKey = `${short}-wc`;
      nodes.push({
        key: wcKey,
        x: colX(colFor(side, depth)),
        y: ys.r1[0],
        round: wc,
        side,
        tie: wcTie,
        placeholder: wcTie ? null : { a: { code: "#8", name: "8 seed", seed: 8 }, b: { code: "#9", name: "9 seed", seed: 9 } },
      });
      depth++;
    }

    // Round One in seed order.
    const r1Slots = place(of(r1, side), 4, roundOneSlot);
    const r1Keys = r1Slots.map((tie, i) => {
      const key = `${short}-r1-${i}`;
      let placeholder: BracketNode["placeholder"] = null;
      if (!tie) {
        const pairs: [number, number][] = [
          [1, 8],
          [4, 5],
          [2, 7],
          [3, 6],
        ];
        const [hi, lo] = pairs[i];
        const top = hi === 1 ? topSeeds[side] : undefined;
        placeholder = {
          a: top ? { ...top, seed: 1 } : { code: `#${hi}`, name: `${hi} seed`, seed: hi },
          b: i === 0 && wc ? (winnerOf(wcTie) ?? { code: "WC", name: "Wild Card winner", seed: null }) : { code: `#${lo}`, name: `${lo} seed`, seed: lo },
        };
      }
      nodes.push({ key, x: colX(colFor(side, depth)), y: ys.r1[i], round: r1, side, tie, placeholder });
      return key;
    });
    if (wcKey) edges.push({ from: wcKey, to: r1Keys[0] });
    depth++;

    // Conference semifinals: placed by which Round One matchups their teams came from.
    const feederPair = (tie: TTie) =>
      r1Slots.slice(0, 2).some((f) => hasTeam(f, tie.teamA.code) || hasTeam(f, tie.teamB.code)) ? 0 : r1Slots.slice(2).some((f) => hasTeam(f, tie.teamA.code) || hasTeam(f, tie.teamB.code)) ? 1 : null;
    const sfSlots = place(of(sf, side), 2, feederPair);
    const sfKeys = sfSlots.map((tie, i) => {
      const key = `${short}-sf-${i}`;
      nodes.push({
        key,
        x: colX(colFor(side, depth)),
        y: sfY[i],
        round: sf,
        side,
        tie,
        placeholder: tie ? null : { a: winnerOf(r1Slots[i * 2]), b: winnerOf(r1Slots[i * 2 + 1]) },
      });
      edges.push({ from: r1Keys[i * 2], to: key }, { from: r1Keys[i * 2 + 1], to: key });
      return key;
    });
    depth++;

    // Conference final.
    const cfTie = of(cf, side)[0] ?? null;
    const cfKey = `${short}-cf`;
    nodes.push({
      key: cfKey,
      x: colX(colFor(side, depth)),
      y: cfY,
      round: cf,
      side,
      tie: cfTie,
      placeholder: cfTie ? null : { a: winnerOf(sfSlots[0]), b: winnerOf(sfSlots[1]) },
    });
    edges.push({ from: sfKeys[0], to: cfKey }, { from: sfKeys[1], to: cfKey });
    cfNodes[side] = cfKey;
    cfTies[side] = cfTie;
  }

  const finTie = of(fin, null)[0] ?? null;
  columns.push({ x: colX(finalCol), round: fin, side: null });
  nodes.push({
    key: "final",
    x: colX(finalCol),
    y: cfY,
    round: fin,
    side: null,
    tie: finTie,
    placeholder: finTie ? null : { a: winnerOf(cfTies.EAST), b: winnerOf(cfTies.WEST) },
  });
  edges.push({ from: cfNodes.EAST!, to: "final" }, { from: cfNodes.WEST!, to: "final" });

  return {
    width: colX(finalCol * 2) + CARD_W + PAD,
    height: rowY(3) + CARD_H + PAD,
    nodes,
    edges,
    columns,
  };
}

/** One column per round, matchups spread evenly; no connectors (we can't know who feeds whom). */
function simpleBracket(rounds: TRound[], ties: TTie[]): BracketLayout {
  const perRound = rounds.map((r) => ties.filter((t) => t.roundId === r.id).sort((a, b) => a.slot - b.slot));
  const rows = Math.max(1, ...perRound.map((t) => t.length));
  const height = rowY(rows - 1) + CARD_H + PAD;
  const nodes: BracketNode[] = [];
  const columns: BracketColumn[] = [];
  rounds.forEach((r, ci) => {
    columns.push({ x: colX(ci), round: r, side: null });
    const list = perRound[ci];
    if (list.length === 0) {
      nodes.push({ key: `r${r.number}-tbd`, x: colX(ci), y: (HEAD + height - CARD_H) / 2, round: r, side: null, tie: null, placeholder: { a: null, b: null } });
      return;
    }
    const band = (height - HEAD - PAD) / list.length;
    list.forEach((tie, i) => {
      nodes.push({ key: `t${tie.id}`, x: colX(ci), y: HEAD + band * i + (band - CARD_H) / 2, round: r, side: null, tie, placeholder: null });
    });
  });
  return { width: colX(rounds.length - 1) + CARD_W + PAD, height, nodes, edges: [], columns };
}

export const HEADER_HEIGHT = HEAD;
