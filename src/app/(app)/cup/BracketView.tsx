"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CARD_H, CARD_W, HEADER_HEIGHT, type BracketLayout, type BracketNode } from "@/lib/bracket";
import { tieLockAt, tieState, type Side, type TieState } from "@/lib/tournament";
import styles from "./bracket.module.css";
import { saveTiePickAction } from "./actions";

export interface MyPick {
  pick: Side;
  totalGoals: number | null;
}

export interface CrowdPerson {
  id: string;
  username: string;
  initials: string;
  color: string | null;
}

const READABLE = 0.75; // below this, a tap zooms in instead of opening a matchup
const MAX_SCALE = 1.4;

export function BracketView({
  layout,
  initialPicks,
  crowd,
  nowIso,
}: {
  layout: BracketLayout;
  initialPicks: Record<number, MyPick>;
  crowd: Record<number, { home: CrowdPerson[]; away: CrowdPerson[] }>;
  nowIso: string;
}) {
  const router = useRouter();
  const viewport = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date(nowIso));
  // Picks saved in this visit sit on top of what the server sent.
  const [savedHere, setPicks] = useState<Record<number, MyPick>>({});
  const picks = useMemo(() => ({ ...initialPicks, ...savedHere }), [initialPicks, savedHere]);
  const [fit, setFit] = useState(0.3);
  const [scale, setScale] = useState(0.3);
  const scaleRef = useRef(scale);
  const ignoreClicksUntil = useRef(0);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const states = useMemo(() => {
    const m = new Map<string, TieState | "empty">();
    for (const n of layout.nodes) m.set(n.key, n.tie ? tieState(n.tie, n.round, now) : "empty");
    return m;
  }, [layout, now]);

  const toPick = layout.nodes.filter((n) => n.tie && states.get(n.key) === "open" && !picks[n.tie.id]);
  const openCount = layout.nodes.filter((n) => states.get(n.key) === "open").length;

  // Fit the whole bracket to the screen width.
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => {
      const f = Math.min(1, el.clientWidth / layout.width);
      setFit(f);
      if (scaleRef.current < f || scaleRef.current === 0.3) {
        scaleRef.current = f;
        setScale(f);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.width]);

  /** Animate to a new scale, keeping content point (cx, cy) under viewport point (vx, vy). */
  const zoomTo = useCallback((target: number, cx: number, cy: number, vx?: number, vy?: number) => {
    const el = viewport.current;
    if (!el) return;
    const from = scaleRef.current;
    const to = Math.max(Math.min(target, MAX_SCALE), Math.min(1, el.clientWidth / layout.width));
    const ax = vx ?? el.clientWidth / 2;
    const ay = vy ?? el.clientHeight / 2;
    const start = performance.now();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = reduce ? 0 : 240;
    const step = (t: number) => {
      const p = dur === 0 ? 1 : Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const s = from + (to - from) * e;
      scaleRef.current = s;
      setScale(s);
      requestAnimationFrame(() => {
        el.scrollLeft = cx * s - ax;
        el.scrollTop = cy * s - ay;
      });
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [layout.width]);

  const contentPoint = (clientX: number, clientY: number) => {
    const el = viewport.current!;
    const r = el.getBoundingClientRect();
    const vx = clientX - r.left;
    const vy = clientY - r.top;
    return { cx: (el.scrollLeft + vx) / scaleRef.current, cy: (el.scrollTop + vy) / scaleRef.current, vx, vy };
  };

  const zoomIntoNode = (n: BracketNode, s = 1) => zoomTo(s, n.x + CARD_W / 2, n.y + CARD_H / 2);

  const onPointerDown = (e: React.PointerEvent) => {
    downAt.current = { x: e.clientX, y: e.clientY };
  };

  // Taps on the background: zoom in when zoomed out; double-tap to zoom back out.
  const onPointerUp = (e: React.PointerEvent) => {
    const d = downAt.current;
    downAt.current = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return; // it was a pan
    if ((e.target as HTMLElement).closest("[data-node]")) return; // cards handle their own taps
    const p = contentPoint(e.clientX, e.clientY);
    const t = performance.now();
    if (scaleRef.current < READABLE) {
      ignoreClicksUntil.current = t + 400;
      zoomTo(1, p.cx, p.cy);
      lastTap.current = null;
      return;
    }
    const prev = lastTap.current;
    if (prev && t - prev.t < 320 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30) {
      zoomTo(fit, p.cx, p.cy, p.vx, p.vy);
      lastTap.current = null;
    } else {
      lastTap.current = { t, x: e.clientX, y: e.clientY };
    }
  };

  const onCardClick = (n: BracketNode, e: React.MouseEvent) => {
    if (performance.now() < ignoreClicksUntil.current) return;
    if (e.detail > 0 && scaleRef.current < READABLE) {
      ignoreClicksUntil.current = performance.now() + 400;
      zoomIntoNode(n);
      return;
    }
    setFocusKey(n.key);
    if (n.tie) setOpenKey(n.key);
  };

  const goNext = () => {
    const next = toPick[0];
    if (!next) return;
    zoomIntoNode(next);
    setFocusKey(next.key);
    setOpenKey(next.key);
  };

  const zoomStep = (dir: 1 | -1) => {
    const el = viewport.current!;
    const cx = (el.scrollLeft + el.clientWidth / 2) / scaleRef.current;
    const cy = (el.scrollTop + el.clientHeight / 2) / scaleRef.current;
    zoomTo(dir > 0 ? scaleRef.current * 1.4 : scaleRef.current / 1.4, cx, cy);
  };

  // Walk order for the ‹ › arrows: round by round, East then West, top to bottom.
  const walk = useMemo(() => {
    const sideRank = (n: BracketNode) => (n.side === "EAST" ? 0 : n.side === "WEST" ? 1 : 2);
    return [...layout.nodes].sort((a, b) => a.round.number - b.round.number || sideRank(a) - sideRank(b) || a.y - b.y);
  }, [layout]);
  const focusIdx = focusKey ? walk.findIndex((n) => n.key === focusKey) : -1;
  const step = (dir: 1 | -1) => {
    // Start from the first matchup that needs a pick (or the first card) when nothing is focused yet.
    const startIdx = focusIdx >= 0 ? focusIdx + dir : Math.max(0, walk.findIndex((n) => n.key === toPick[0]?.key));
    const next = walk[(startIdx + walk.length) % walk.length];
    if (!next) return;
    setFocusKey(next.key);
    zoomIntoNode(next);
  };
  const focused = focusIdx >= 0 ? walk[focusIdx] : null;

  const byKey = useMemo(() => new Map(layout.nodes.map((n) => [n.key, n])), [layout]);
  const openNode = openKey ? byKey.get(openKey) ?? null : null;
  const zoomedOut = scale < READABLE;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        {toPick.length > 0 ? (
          <button type="button" className={styles.nextButton} onClick={goNext}>
            <span className={styles.nextCount}>{toPick.length}</span> TO PICK · GO ›
          </button>
        ) : openCount > 0 ? (
          <span className={styles.allSet}>✓ All open matchups picked</span>
        ) : (
          <span className={styles.allSet}>Nothing to pick right now</span>
        )}
        <div className={styles.zoomButtons}>
          <button type="button" aria-label="Zoom out" onClick={() => zoomStep(-1)} disabled={scale <= fit + 0.01}>
            −
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => zoomStep(1)} disabled={scale >= MAX_SCALE - 0.01}>
            +
          </button>
        </div>
      </div>
      <div className={styles.stepper}>
        <button type="button" aria-label="Previous matchup" onClick={() => step(-1)}>
          ‹
        </button>
        <button
          type="button"
          className={styles.stepLabel}
          onClick={() => (focused?.tie ? setOpenKey(focused.key) : step(1))}
          aria-live="polite"
        >
          {focused ? (
            <>
              <span className={styles.stepRound}>
                {focused.round.name}
                {focused.side ? ` · ${focused.side}` : ""}
              </span>
              <span className={styles.stepTeams}>
                {focused.tie
                  ? `${focused.tie.teamA.code} v ${focused.tie.teamB.code} · TAP TO OPEN`
                  : `${focused.placeholder?.a?.code ?? "TBD"} v ${focused.placeholder?.b?.code ?? "TBD"} · NOT SET`}
              </span>
            </>
          ) : (
            <span className={styles.stepRound}>Walk the bracket</span>
          )}
        </button>
        <button type="button" aria-label="Next matchup" onClick={() => step(1)}>
          ›
        </button>
      </div>
      <p className={styles.hint} aria-live="polite">
        {zoomedOut ? "Double-tap the bracket to zoom in" : "Tap a glowing matchup to pick · double-tap to zoom out"}
      </p>

      <div
        ref={viewport}
        className={styles.viewport}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        role="region"
        aria-label="Tournament bracket"
      >
        <div style={{ width: layout.width * scale, height: layout.height * scale, position: "relative" }}>
          <div className={styles.canvas} style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}>
            {uniqueColumns(layout).map((c) => (
              <div key={`${c.x}`} className={styles.colHead} style={{ left: c.x, width: CARD_W, height: HEADER_HEIGHT - 8 }}>
                <span className={styles.colName}>{c.round.name}</span>
                <span className={styles.colPts}>
                  {c.side ? `${c.side} · ` : ""}+{c.round.points}
                </span>
              </div>
            ))}
            <svg className={styles.lines} width={layout.width} height={layout.height} aria-hidden="true">
              {layout.edges.map((e) => {
                const a = byKey.get(e.from)!;
                const b = byKey.get(e.to)!;
                const leftToRight = a.x < b.x;
                const x1 = leftToRight ? a.x + CARD_W : a.x;
                const x2 = leftToRight ? b.x : b.x + CARD_W;
                const y1 = a.y + CARD_H / 2;
                const y2 = b.y + CARD_H / 2;
                const mx = (x1 + x2) / 2;
                const done = a.tie?.winner != null;
                return (
                  <path
                    key={`${e.from}-${e.to}`}
                    d={`M${x1} ${y1} H${mx} V${y2} H${x2}`}
                    className={done ? styles.lineDone : styles.line}
                  />
                );
              })}
            </svg>
            {layout.nodes.map((n) => (
              <Card key={n.key} node={n} focused={n.key === focusKey} state={states.get(n.key)!} pick={n.tie ? picks[n.tie.id] : undefined} onClick={onCardClick} />
            ))}
          </div>
        </div>
      </div>

      {openNode?.tie && (
        <PickSheet
          key={openNode.key}
          node={openNode}
          state={states.get(openNode.key) as TieState}
          now={now}
          mine={picks[openNode.tie.id]}
          crowd={crowd[openNode.tie.id]}
          hasNext={toPick.some((n) => n.key !== openNode.key)}
          onClose={() => setOpenKey(null)}
          onSaved={(p) => {
            setPicks((prev) => ({ ...prev, [openNode.tie!.id]: p }));
            router.refresh();
          }}
          onNext={() => {
            const next = toPick.find((n) => n.key !== openNode.key);
            if (!next) return setOpenKey(null);
            zoomIntoNode(next);
            setFocusKey(next.key);
            setOpenKey(next.key);
          }}
        />
      )}
    </div>
  );
}

function uniqueColumns(layout: BracketLayout) {
  const seen = new Set<number>();
  return layout.columns.filter((c) => (seen.has(c.x) ? false : (seen.add(c.x), true)));
}

function Card({
  node,
  focused,
  state,
  pick,
  onClick,
}: {
  node: BracketNode;
  focused: boolean;
  state: TieState | "empty";
  pick: MyPick | undefined;
  onClick: (n: BracketNode, e: React.MouseEvent) => void;
}) {
  const { tie } = node;
  const style = { left: node.x, top: node.y, width: CARD_W, height: CARD_H };

  if (!tie) {
    const a = node.placeholder?.a;
    const b = node.placeholder?.b;
    return (
      <div className={`${styles.card} ${styles.cardEmpty} ${focused ? styles.cardFocus : ""}`} style={style} data-node={node.key}>
        <div className={styles.team}>
          <span className={styles.seed}>{a?.seed ?? ""}</span>
          <span className={styles.code}>{a?.code ?? "TBD"}</span>
        </div>
        <div className={styles.team}>
          <span className={styles.seed}>{b?.seed ?? ""}</span>
          <span className={styles.code}>{b?.code ?? "TBD"}</span>
        </div>
      </div>
    );
  }

  const needsPick = state === "open" && !pick;
  const right = state === "done" && pick && pick.pick === tie.winner;
  const cls = [
    styles.card,
    styles.cardButton,
    needsPick ? styles.cardPick : "",
    state === "open" && pick ? styles.cardPicked : "",
    state === "locked" ? styles.cardLocked : "",
    state === "done" ? styles.cardDone : "",
    state === "tbd" ? styles.cardTbd : "",
    focused ? styles.cardFocus : "",
  ].join(" ");

  const badge =
    needsPick ? (
      <span className={`${styles.badge} ${styles.badgePick}`}>PICK</span>
    ) : state === "open" ? (
      <span className={`${styles.badge} ${styles.badgeOk}`} aria-label="Picked">
        ✓
      </span>
    ) : state === "locked" ? (
      <span className={`${styles.badge} ${styles.badgeLock}`} aria-label="Locked">
        🔒
      </span>
    ) : state === "done" ? (
      <span className={`${styles.badge} ${right ? styles.badgeOk : styles.badgeMiss}`}>{right ? `+${node.round.points}` : "✗"}</span>
    ) : null;

  const label = `${node.round.name}: ${tie.teamA.name} vs ${tie.teamB.name}. ${
    needsPick ? "Pick now." : pick ? `You picked ${pick.pick === "home" ? tie.teamA.name : tie.teamB.name}.` : state === "locked" ? "Locked." : ""
  }`;

  return (
    <button type="button" className={cls} style={style} data-node={node.key} onClick={(e) => onClick(node, e)} aria-label={label}>
      {(["home", "away"] as const).map((side) => {
        const team = side === "home" ? tie.teamA : tie.teamB;
        const seed = side === "home" ? tie.seedA : tie.seedB;
        const mine = pick?.pick === side;
        const won = tie.winner === side;
        const lost = tie.winner && !won;
        return (
          <span key={side} className={[styles.team, mine ? styles.teamMine : "", won ? styles.teamWon : "", lost ? styles.teamLost : ""].join(" ")}>
            <span className={styles.seed}>{seed ?? ""}</span>
            <span className={styles.code}>{team.code}</span>
            {mine && <span className={styles.myDot} aria-hidden="true" />}
          </span>
        );
      })}
      {badge}
    </button>
  );
}

function PickSheet({
  node,
  state,
  now,
  mine,
  crowd,
  hasNext,
  onClose,
  onSaved,
  onNext,
}: {
  node: BracketNode;
  state: TieState;
  now: Date;
  mine: MyPick | undefined;
  crowd: { home: CrowdPerson[]; away: CrowdPerson[] } | undefined;
  hasNext: boolean;
  onClose: () => void;
  onSaved: (p: MyPick) => void;
  onNext: () => void;
}) {
  const tie = node.tie!;
  const ref = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<Side | null>(mine?.pick ?? null);
  const [goals, setGoals] = useState<number>(mine?.totalGoals ?? 2);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const lock = tieLockAt(tie, node.round);
  const editable = state === "open";
  const isFinal = node.round.isFinal;
  const changed = choice !== (mine?.pick ?? null) || (isFinal && goals !== (mine?.totalGoals ?? 2));

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const save = () => {
    if (!choice) return;
    setError(null);
    start(async () => {
      const res = await saveTiePickAction(tie.id, choice, isFinal ? goals : null);
      if (!res.ok) return setError(res.error ?? "Couldn't save.");
      onSaved({ pick: choice, totalGoals: isFinal ? goals : null });
      setSaved(true);
    });
  };

  return (
    <dialog ref={ref} className={styles.sheet} onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className={styles.sheetInner}>
        <div className={styles.grabber} aria-hidden="true" />
        <div className={styles.sheetHead}>
          <div>
            <div className={styles.sheetKicker}>
              {node.side ? `${node.side} · ` : ""}
              {node.round.name.toUpperCase()}
            </div>
            <h2 className={styles.sheetTitle}>Who goes through?</h2>
          </div>
          <span className={styles.sheetPts}>+{node.round.points}</span>
        </div>
        <p className={styles.sheetLock}>
          {state === "open" && lock ? (
            <>
              Locks in <strong>{timeLeft(lock, now)}</strong> · 1 hour before kickoff
            </>
          ) : state === "locked" ? (
            "🔒 Locked. Waiting for the result."
          ) : state === "done" ? (
            `${tie.winner === "home" ? tie.teamA.name : tie.teamB.name} went through.`
          ) : (
            "Kickoff time isn't set yet. Picks open once it is."
          )}
        </p>

        {saved ? (
          <div className={styles.savedBox}>
            <span className={styles.savedTick} aria-hidden="true">
              ✓
            </span>
            <span>
              Locked in <strong>{choice === "home" ? tie.teamA.name : tie.teamB.name}</strong>. You can change it until the lock.
            </span>
          </div>
        ) : (
          <div className={styles.choices} role="radiogroup" aria-label="Pick the team that advances">
            {(["home", "away"] as const).map((side) => {
              const team = side === "home" ? tie.teamA : tie.teamB;
              const seed = side === "home" ? tie.seedA : tie.seedB;
              const on = choice === side;
              const won = tie.winner === side;
              return (
                <button
                  key={side}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!editable}
                  className={[styles.choice, on ? styles.choiceOn : "", won ? styles.choiceWon : ""].join(" ")}
                  onClick={() => setChoice(side)}
                >
                  {seed != null && <span className={styles.choiceSeed}>#{seed}</span>}
                  <span className={styles.choiceCode}>{team.code}</span>
                  <span className={styles.choiceName}>{team.name}</span>
                  {on && <span className={styles.choiceMark}>{editable ? "YOUR PICK" : "YOU PICKED"}</span>}
                  {crowd && !editable && (
                    <span className={styles.crowd}>
                      {(side === "home" ? crowd.home : crowd.away).map((p) => (
                        <span key={p.id} className={styles.crowdDot} style={{ background: p.color ?? "var(--purple)" }} title={p.username}>
                          {p.initials}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {isFinal && !saved && (
          <div className={styles.goalsBox}>
            <span className={styles.goalsLabel}>Tie-breaker: total goals in the final</span>
            <div className={styles.goalsRow}>
              <button type="button" disabled={!editable} aria-label="Fewer goals" onClick={() => setGoals((g) => Math.max(0, g - 1))}>
                −
              </button>
              <output aria-live="polite">{goals}</output>
              <button type="button" disabled={!editable} aria-label="More goals" onClick={() => setGoals((g) => Math.min(30, g + 1))}>
                +
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <div className={styles.sheetActions}>
          {saved ? (
            <>
              <button type="button" className={styles.secondary} onClick={() => ref.current?.close()}>
                BACK TO BRACKET
              </button>
              {hasNext && (
                <button type="button" className={styles.primary} onClick={onNext}>
                  NEXT MATCHUP ›
                </button>
              )}
            </>
          ) : editable ? (
            <>
              <button type="button" className={styles.secondary} onClick={() => ref.current?.close()}>
                CANCEL
              </button>
              <button type="button" className={styles.primary} disabled={!choice || pending || (!changed && !!mine)} onClick={save}>
                {pending ? "SAVING…" : mine ? "UPDATE PICK" : "LOCK IT IN"}
              </button>
            </>
          ) : (
            <button type="button" className={styles.secondary} onClick={() => ref.current?.close()}>
              CLOSE
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

function timeLeft(iso: string, now: Date): string {
  const ms = Date.parse(iso) - now.getTime();
  if (ms <= 0) return "moments";
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}
