import type { TRound, TTeam, TTie } from "./tournament";

/**
 * Lays out a tournament as a bracket picture, either way round.
 *
 * MLS-style (ties labelled EAST / WEST): East on one end, West on the other,
 * the final in the middle. Round One sits in seed order [1v8/9, 4v5, 2v7, 3v6],
 * so winners meet the way the real bracket does; the Wild Card hangs off the
 * 1-seed's matchup. Missing matchups are drawn as placeholders so the shape is
 * always complete.
 *
 * - horizontal: rounds are columns; East left, West right.
 * - vertical (phones): rounds are rows; East on top, West at the bottom.
 *
 * Anything else falls back to plain rounds in order, one column/row each.
 */

export type Orientation = "horizontal" | "vertical";
export type Conference = "EAST" | "WEST";

const SIZES = {
  horizontal: { cardW: 148, cardH: 72, slotGap: 18, stageGap: 30, head: 40 },
  vertical: { cardW: 120, cardH: 72, slotGap: 10, stageGap: 14, head: 26 },
} as const;
const PAD = 16;

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

/** A round's label: above its column (horizontal) or above its row (vertical). */
export interface BracketBand {
  x: number;
  y: number;
  width: number;
  height: number;
  round: TRound;
  side: Conference | null;
}

export interface BracketLayout {
  orientation: Orientation;
  width: number;
  height: number;
  cardW: number;
  cardH: number;
  nodes: BracketNode[];
  edges: BracketEdge[];
  bands: BracketBand[];
}

/** Position before projecting: `stage` = which column/row, `slot` = where along it (0..slots-1, may be fractional). */
interface Abstract {
  key: string;
  stage: number;
  slot: number;
  round: TRound;
  side: Conference | null;
  tie: TTie | null;
  placeholder: BracketNode["placeholder"];
}

const sideOf = (tie: TTie): Conference | null =>
  tie.label?.toUpperCase().startsWith("E") ? "EAST" : tie.label?.toUpperCase().startsWith("W") ? "WEST" : null;

const winnerOf = (tie: TTie | null | undefined): BracketSlotTeam | null => {
  if (!tie?.winner) return null;
  return tie.winner === "home" ? { ...tie.teamA, seed: tie.seedA } : { ...tie.teamB, seed: tie.seedB };
};

const hasTeam = (tie: TTie | null | undefined, code: string) =>
  Boolean(tie && (tie.teamA.code === code || tie.teamB.code === code));

/** Round One slot (0-3) from the seeds: 1v8, 4v5, 2v7, 3v6. */
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
  opts: { topSeeds?: Partial<Record<Conference, TTeam>>; orientation?: Orientation } = {},
): BracketLayout {
  const sorted = [...rounds].sort((a, b) => a.number - b.number);
  const shape = isConferenceBracket(sorted, ties)
    ? conferenceBracket(sorted, ties, opts.topSeeds ?? {})
    : simpleBracket(sorted, ties);
  return project(shape, opts.orientation ?? "horizontal");
}

interface Shape {
  stages: { round: TRound; side: Conference | null }[];
  slots: number;
  nodes: Abstract[];
  edges: BracketEdge[];
}

function project(shape: Shape, orientation: Orientation): BracketLayout {
  const s = SIZES[orientation];
  const horizontal = orientation === "horizontal";
  // Along a stage, slots are spaced by the card's size in that direction.
  const slotStride = (horizontal ? s.cardH : s.cardW) + s.slotGap;
  const stageStride = (horizontal ? s.cardW : s.cardH + s.head) + s.stageGap;
  const stagePos = (stage: number) => PAD + stage * stageStride + (horizontal ? 0 : s.head);
  const slotPos = (slot: number) => PAD + (horizontal ? s.head : 0) + slot * slotStride;
  const along = PAD * 2 + (horizontal ? s.head : 0) + (shape.slots - 1) * slotStride + (horizontal ? s.cardH : s.cardW);
  const across = stagePos(shape.stages.length - 1) + (horizontal ? s.cardW : s.cardH) + PAD;

  const nodes: BracketNode[] = shape.nodes.map((n) => ({
    key: n.key,
    x: horizontal ? stagePos(n.stage) : slotPos(n.slot),
    y: horizontal ? slotPos(n.slot) : stagePos(n.stage),
    round: n.round,
    side: n.side,
    tie: n.tie,
    placeholder: n.placeholder,
  }));
  const bands: BracketBand[] = shape.stages.map((st, i) =>
    horizontal
      ? { x: stagePos(i), y: 8, width: s.cardW, height: s.head - 8, round: st.round, side: st.side }
      : { x: PAD, y: stagePos(i) - s.head, width: along - PAD * 2, height: s.head - 4, round: st.round, side: st.side },
  );
  return {
    orientation,
    width: horizontal ? across : along,
    height: horizontal ? along : across,
    cardW: s.cardW,
    cardH: s.cardH,
    nodes,
    edges: shape.edges,
    bands,
  };
}

function conferenceBracket(rounds: TRound[], ties: TTie[], topSeeds: Partial<Record<Conference, TTeam>>): Shape {
  const hasWildCard = rounds.length === 5;
  const wc: TRound | null = hasWildCard ? rounds[0] : null;
  const [r1, sf, cf, fin] = hasWildCard ? rounds.slice(1) : rounds;
  const of = (r: TRound | null, side: Conference | null) =>
    r ? ties.filter((t) => t.roundId === r.id && (side === null || sideOf(t) === side)).sort((a, b) => a.slot - b.slot) : [];

  // Stages from one end to the other: [WC] R1 SF CF  FINAL  CF SF R1 [WC]
  const perSide = [wc, r1, sf, cf].filter((r): r is TRound => r !== null);
  const finalStage = perSide.length;
  const stageFor = (side: Conference, depth: number) => (side === "EAST" ? depth : finalStage * 2 - depth);
  const stages: Shape["stages"] = [
    ...perSide.map((round) => ({ round, side: "EAST" as const })),
    { round: fin, side: null },
    ...[...perSide].reverse().map((round) => ({ round, side: "WEST" as const })),
  ];

  const nodes: Abstract[] = [];
  const edges: BracketEdge[] = [];
  const cfTies: Partial<Record<Conference, TTie | null>> = {};
  const cfKeys: Partial<Record<Conference, string>> = {};

  for (const side of ["EAST", "WEST"] as const) {
    let depth = 0;
    const short = side === "EAST" ? "E" : "W";

    const wcTie = of(wc, side)[0] ?? null;
    let wcKey: string | null = null;
    if (wc) {
      wcKey = `${short}-wc`;
      nodes.push({
        key: wcKey,
        stage: stageFor(side, depth),
        slot: 0,
        round: wc,
        side,
        tie: wcTie,
        placeholder: wcTie ? null : { a: { code: "#8", name: "8 seed", seed: 8 }, b: { code: "#9", name: "9 seed", seed: 9 } },
      });
      depth++;
    }

    const r1Slots = place(of(r1, side), 4, roundOneSlot);
    const pairs: [number, number][] = [
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ];
    const r1Keys = r1Slots.map((tie, i) => {
      const key = `${short}-r1-${i}`;
      let placeholder: BracketNode["placeholder"] = null;
      if (!tie) {
        const [hi, lo] = pairs[i];
        const top = hi === 1 ? topSeeds[side] : undefined;
        placeholder = {
          a: top ? { ...top, seed: 1 } : { code: `#${hi}`, name: `${hi} seed`, seed: hi },
          b: i === 0 && wc ? (winnerOf(wcTie) ?? { code: "WC", name: "Wild Card winner", seed: null }) : { code: `#${lo}`, name: `${lo} seed`, seed: lo },
        };
      }
      nodes.push({ key, stage: stageFor(side, depth), slot: i, round: r1, side, tie, placeholder });
      return key;
    });
    if (wcKey) edges.push({ from: wcKey, to: r1Keys[0] });
    depth++;

    const fromPair = (tie: TTie, lo: number) =>
      r1Slots.slice(lo, lo + 2).some((f) => hasTeam(f, tie.teamA.code) || hasTeam(f, tie.teamB.code));
    const sfSlots = place(of(sf, side), 2, (tie) => (fromPair(tie, 0) ? 0 : fromPair(tie, 2) ? 1 : null));
    const sfKeys = sfSlots.map((tie, i) => {
      const key = `${short}-sf-${i}`;
      nodes.push({
        key,
        stage: stageFor(side, depth),
        slot: i * 2 + 0.5,
        round: sf,
        side,
        tie,
        placeholder: tie ? null : { a: winnerOf(r1Slots[i * 2]), b: winnerOf(r1Slots[i * 2 + 1]) },
      });
      edges.push({ from: r1Keys[i * 2], to: key }, { from: r1Keys[i * 2 + 1], to: key });
      return key;
    });
    depth++;

    const cfTie = of(cf, side)[0] ?? null;
    const cfKey = `${short}-cf`;
    nodes.push({
      key: cfKey,
      stage: stageFor(side, depth),
      slot: 1.5,
      round: cf,
      side,
      tie: cfTie,
      placeholder: cfTie ? null : { a: winnerOf(sfSlots[0]), b: winnerOf(sfSlots[1]) },
    });
    edges.push({ from: sfKeys[0], to: cfKey }, { from: sfKeys[1], to: cfKey });
    cfTies[side] = cfTie;
    cfKeys[side] = cfKey;
  }

  const finTie = of(fin, null)[0] ?? null;
  nodes.push({
    key: "final",
    stage: finalStage,
    slot: 1.5,
    round: fin,
    side: null,
    tie: finTie,
    placeholder: finTie ? null : { a: winnerOf(cfTies.EAST), b: winnerOf(cfTies.WEST) },
  });
  edges.push({ from: cfKeys.EAST!, to: "final" }, { from: cfKeys.WEST!, to: "final" });

  return { stages, slots: 4, nodes, edges };
}

/** One stage per round, matchups spread evenly; no connectors (we can't know who feeds whom). */
function simpleBracket(rounds: TRound[], ties: TTie[]): Shape {
  const perRound = rounds.map((r) => ties.filter((t) => t.roundId === r.id).sort((a, b) => a.slot - b.slot));
  const slots = Math.max(1, ...perRound.map((t) => t.length));
  const nodes: Abstract[] = [];
  rounds.forEach((round, stage) => {
    const list = perRound[stage];
    if (list.length === 0) {
      nodes.push({ key: `r${round.number}-tbd`, stage, slot: (slots - 1) / 2, round, side: null, tie: null, placeholder: { a: null, b: null } });
      return;
    }
    list.forEach((tie, i) => {
      nodes.push({ key: `t${tie.id}`, stage, slot: ((i + 0.5) * slots) / list.length - 0.5, round, side: null, tie, placeholder: null });
    });
  });
  return { stages: rounds.map((round) => ({ round, side: null })), slots, nodes, edges: [] };
}
