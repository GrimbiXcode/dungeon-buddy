<script lang="ts">
  import { untrack } from "svelte";
  import { Maximize2, Minus, Plus } from "@lucide/svelte";
  import type { Npc, NpcRelation } from "../../lib/types";
  import { ATTITUDES, attitudeColor, hasPlayerLink, initials } from "./attitude";
  import { ForceSim, spiralPosition, type SimLink, type SimNode } from "./force";

  let {
    npcs,
    relations,
    onopen,
  }: {
    npcs: Npc[];
    relations: NpcRelation[];
    onopen: (id: string) => void;
  } = $props();

  const YOU = "__you__";
  const uid = Math.random().toString(36).slice(2, 8);
  const reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  let w = $state(0);
  let h = $state(0);
  let svg: SVGSVGElement | undefined = $state();

  /** Ansicht: Verschiebung (Bildschirm-px) und Zoom */
  let view = $state({ x: 0, y: 0, k: 1 });
  let autoFit = true;

  type Pos = { x: number; y: number };
  let pos = $state.raw(new Map<string, Pos>());
  /** Positionen merken, damit das Netz bei Änderungen nicht neu „explodiert“ */
  const remembered = new Map<string, Pos>();

  let sim: ForceSim | null = null;
  let raf = 0;
  let hoverId = $state<string | null>(null);
  let dragId = $state<string | null>(null);

  // ── Graph-Daten ────────────────────────────────────────────────────
  const npcById = $derived(new Map(npcs.map(n => [n.id, n])));

  const degree = $derived.by(() => {
    const d = new Map<string, number>();
    for (const r of relations) {
      d.set(r.fromNpcId, (d.get(r.fromNpcId) ?? 0) + 1);
      d.set(r.toNpcId, (d.get(r.toNpcId) ?? 0) + 1);
    }
    return d;
  });

  const radius = (id: string) => (id === YOU ? 24 : 16 + Math.min(degree.get(id) ?? 0, 6) * 1.3);

  type Edge = {
    id: string;
    a: string;
    b: string;
    kind: "you" | "rel";
    attitude: number;
    label: string;
    title: string;
    offset: number;
    /** Normale aus Sicht des sortierten Paares */
    flip: boolean;
  };

  const edges = $derived.by(() => {
    const list: Edge[] = [];
    for (const n of npcs) {
      if (!hasPlayerLink(n)) continue;
      list.push({
        id: `you-${n.id}`,
        a: YOU,
        b: n.id,
        kind: "you",
        attitude: n.attitude,
        label: "",
        title: `Du / Gruppe – ${n.name}${n.relation ? `: ${n.relation}` : ""}`,
        offset: 0,
        flip: false,
      });
    }
    const groups = new Map<string, NpcRelation[]>();
    for (const r of relations) {
      if (!npcById.has(r.fromNpcId) || !npcById.has(r.toNpcId)) continue;
      const key = [r.fromNpcId, r.toNpcId].sort().join("|");
      const g = groups.get(key) ?? [];
      g.push(r);
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      g.forEach((r, i) => {
        const from = npcById.get(r.fromNpcId)!;
        const to = npcById.get(r.toNpcId)!;
        list.push({
          id: r.id,
          a: r.fromNpcId,
          b: r.toNpcId,
          kind: "rel",
          attitude: r.attitude,
          label: r.label,
          title: `${from.name} → ${to.name}${r.label ? `: ${r.label}` : ""}`,
          offset: g.length > 1 ? (i - (g.length - 1) / 2) * 34 : 0,
          flip: r.fromNpcId > r.toNpcId,
        });
      });
    }
    return list;
  });

  const relEdgeCount = $derived(edges.filter(e => e.kind === "rel").length);
  const showEdgeLabels = $derived(view.k >= 0.7 && (relEdgeCount <= 30 || view.k >= 1.2));
  const showNodeLabels = $derived(view.k >= 0.3);
  // Beschriftungen beim Herauszoomen nicht unlesbar klein werden lassen
  const labelSize = $derived(Math.max(12, 10.5 / view.k));
  const edgeLabelSize = $derived(Math.max(10.5, 9.5 / view.k));

  const neighbours = $derived.by(() => {
    const focus = dragId ?? hoverId;
    if (!focus) return null;
    const s = new Set<string>([focus]);
    for (const e of edges) {
      if (e.a === focus) s.add(e.b);
      if (e.b === focus) s.add(e.a);
    }
    return s;
  });

  type EdgeGeom = Edge & { d: string; lx: number; ly: number; dim: boolean };

  const edgeGeoms = $derived.by(() => {
    const out: EdgeGeom[] = [];
    const focus = dragId ?? hoverId;
    for (const e of edges) {
      const pa = pos.get(e.a);
      const pb = pos.get(e.b);
      if (!pa || !pb) continue;
      const ra = radius(e.a);
      const rb = radius(e.b) + (e.kind === "rel" ? 3 : 0);
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.hypot(dx, dy) || 1;
      const dim = focus !== null && e.a !== focus && e.b !== focus;
      if (e.offset === 0) {
        const ux = dx / dist;
        const uy = dy / dist;
        const sx = pa.x + ux * ra;
        const sy = pa.y + uy * ra;
        const ex = pb.x - ux * rb;
        const ey = pb.y - uy * rb;
        out.push({ ...e, d: `M${sx},${sy}L${ex},${ey}`, lx: (pa.x + pb.x) / 2, ly: (pa.y + pb.y) / 2, dim });
      } else {
        const sign = e.flip ? -1 : 1;
        const nx = (-dy / dist) * sign;
        const ny = (dx / dist) * sign;
        const cx = (pa.x + pb.x) / 2 + nx * e.offset * 2;
        const cy = (pa.y + pb.y) / 2 + ny * e.offset * 2;
        const sa = Math.hypot(cx - pa.x, cy - pa.y) || 1;
        const sb = Math.hypot(pb.x - cx, pb.y - cy) || 1;
        const sx = pa.x + ((cx - pa.x) / sa) * ra;
        const sy = pa.y + ((cy - pa.y) / sa) * ra;
        const ex = pb.x - ((pb.x - cx) / sb) * rb;
        const ey = pb.y - ((pb.y - cy) / sb) * rb;
        out.push({
          ...e,
          d: `M${sx},${sy}Q${cx},${cy} ${ex},${ey}`,
          lx: 0.25 * pa.x + 0.5 * cx + 0.25 * pb.x,
          ly: 0.25 * pa.y + 0.5 * cy + 0.25 * pb.y,
          dim,
        });
      }
    }
    return out;
  });

  // ── Simulation ─────────────────────────────────────────────────────
  function rebuild(list: Npc[], rels: NpcRelation[]) {
    const ids = [YOU, ...list.map(n => n.id)];
    const index = new Map(ids.map((id, i) => [id, i]));
    const adjacency = new Map<string, string[]>();
    for (const r of rels) {
      adjacency.set(r.fromNpcId, [...(adjacency.get(r.fromNpcId) ?? []), r.toNpcId]);
      adjacency.set(r.toNpcId, [...(adjacency.get(r.toNpcId) ?? []), r.fromNpcId]);
    }
    let fresh = 0;
    const nodes: SimNode[] = ids.map((id, i) => {
      let p = remembered.get(id);
      if (!p) {
        fresh++;
        if (id === YOU) p = { x: 0, y: 0 };
        else {
          const known = (adjacency.get(id) ?? []).map(o => remembered.get(o)).find(Boolean);
          p = known
            ? { x: known.x + (Math.random() - 0.5) * 60, y: known.y + (Math.random() - 0.5) * 60 }
            : spiralPosition(i);
        }
      }
      const node: SimNode = { id, x: p.x, y: p.y, vx: 0, vy: 0, r: radius(id), fx: null, fy: null };
      if (id === YOU) {
        node.fx = p.x;
        node.fy = p.y;
      }
      return node;
    });

    const links: SimLink[] = [];
    const seen = new Set<string>();
    for (const n of list) {
      if (!hasPlayerLink(n)) continue;
      links.push({ source: 0, target: index.get(n.id)!, distance: 170 - n.attitude * 18, strength: 0.35 });
    }
    for (const r of rels) {
      const a = index.get(r.fromNpcId);
      const b = index.get(r.toNpcId);
      if (a === undefined || b === undefined) continue;
      const key = [a, b].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ source: a, target: b, distance: 120, strength: 0.7 });
    }

    stop();
    sim = new ForceSim(nodes, links);
    if (w && h) sim.aspect = h / w;
    sim.alpha = fresh > 1 ? 1 : fresh === 1 ? 0.5 : 0.25;
    if (reducedMotion) {
      sim.settle();
      publish();
    } else {
      publish();
      start();
    }
  }

  function publish() {
    if (!sim) return;
    const m = new Map<string, Pos>();
    for (const n of sim.nodes) {
      const p = { x: n.x, y: n.y };
      m.set(n.id, p);
      remembered.set(n.id, p);
    }
    pos = m;
    if (autoFit) fit(!reducedMotion && sim.running);
  }

  function frame() {
    raf = 0;
    if (!sim) return;
    if (w && h) sim.aspect = h / w;
    sim.tick();
    sim.tick();
    publish();
    if (sim.running) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  $effect(() => {
    const list = npcs;
    const rels = relations;
    untrack(() => rebuild(list, rels));
  });

  $effect(() => stop);

  // Bei Grössenänderung neu einpassen
  $effect(() => {
    if (!w || !h) return;
    untrack(() => {
      if (autoFit) fit(false);
      else if (view.x === 0 && view.y === 0) view = { x: w / 2, y: h / 2, k: view.k };
    });
  });

  // ── Ansicht ────────────────────────────────────────────────────────
  function fit(smooth: boolean) {
    if (!w || !h || !pos.size) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [id, p] of pos) {
      const r = radius(id);
      minX = Math.min(minX, p.x - r - 30);
      maxX = Math.max(maxX, p.x + r + 30);
      minY = Math.min(minY, p.y - r - 8);
      maxY = Math.max(maxY, p.y + r + 26);
    }
    const pad = 24;
    const k = clamp(Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY)), 0.25, 1.4);
    const target = { x: w / 2 - ((minX + maxX) / 2) * k, y: h / 2 - ((minY + maxY) / 2) * k, k };
    if (smooth) {
      const t = 0.2;
      view = { x: view.x + (target.x - view.x) * t, y: view.y + (target.y - view.y) * t, k: view.k + (target.k - view.k) * t };
    } else view = target;
  }

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  function zoomAt(factor: number, sx: number, sy: number) {
    autoFit = false;
    const k = clamp(view.k * factor, 0.2, 3);
    const wx = (sx - view.x) / view.k;
    const wy = (sy - view.y) / view.k;
    view = { x: sx - wx * k, y: sy - wy * k, k };
  }

  function resetView() {
    autoFit = true;
    fit(false);
  }

  function local(e: { clientX: number; clientY: number }) {
    const rect = svg!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  const toWorld = (p: Pos) => ({ x: (p.x - view.x) / view.k, y: (p.y - view.y) / view.k });

  // Mausrad (nicht passiv, damit die Seite nicht scrollt)
  $effect(() => {
    const el = svg;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-delta * 0.0018), p.x, p.y);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  // ── Zeiger: Knoten ziehen, Fläche verschieben, Pinch-Zoom ─────────
  type Gesture =
    | { kind: "node"; id: string; pointerId: number; start: Pos; grab: Pos; moved: boolean }
    | { kind: "pan"; pointerId: number; start: Pos; orig: Pos; moved: boolean }
    | { kind: "pinch"; dist: number; k: number; world: Pos };

  const pointers = new Map<number, Pos>();
  let gesture: Gesture | null = null;
  let panning = $state(false);

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    svg!.setPointerCapture(e.pointerId);

    if (pointers.size === 2) {
      // zweiter Finger: Pinch-Zoom statt Ziehen
      releaseNode();
      const [a, b] = [...pointers.values()] as [Pos, Pos];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gesture = { kind: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: view.k, world: toWorld(mid) };
      return;
    }
    if (pointers.size > 2) return;

    const nodeEl = (e.target as Element).closest<SVGGElement>("[data-node]");
    if (nodeEl && sim) {
      const id = nodeEl.dataset.node!;
      const node = sim.nodes.find(n => n.id === id);
      if (!node) return;
      const wp = toWorld(p);
      gesture = { kind: "node", id, pointerId: e.pointerId, start: p, grab: { x: node.x - wp.x, y: node.y - wp.y }, moved: false };
    } else {
      gesture = { kind: "pan", pointerId: e.pointerId, start: p, orig: { x: view.x, y: view.y }, moved: false };
    }
  }

  function onpointermove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    const g = gesture;
    if (!g) return;

    if (g.kind === "pinch") {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()] as [Pos, Pos];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k = clamp((g.k * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist, 0.2, 3);
      autoFit = false;
      view = { x: mid.x - g.world.x * k, y: mid.y - g.world.y * k, k };
      return;
    }
    if (g.pointerId !== e.pointerId) return;
    if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < 5) return;
    g.moved = true;

    if (g.kind === "pan") {
      autoFit = false;
      panning = true;
      view = { x: g.orig.x + (p.x - g.start.x), y: g.orig.y + (p.y - g.start.y), k: view.k };
    } else if (sim) {
      autoFit = false;
      dragId = g.id;
      const node = sim.nodes.find(n => n.id === g.id);
      if (!node) return;
      const wp = toWorld(p);
      node.fx = wp.x + g.grab.x;
      node.fy = wp.y + g.grab.y;
      if (reducedMotion) {
        node.x = node.fx;
        node.y = node.fy;
        publish();
      } else {
        sim.alphaTarget = 0.25;
        if (sim.alpha < 0.25) sim.alpha = 0.25;
        start();
      }
    }
  }

  function releaseNode() {
    if (gesture?.kind === "node" && sim) {
      const node = sim.nodes.find(n => n.id === (gesture as { id: string }).id);
      // „Du“ bleibt dort, wo es abgelegt wurde
      if (node && node.id !== YOU) {
        node.fx = null;
        node.fy = null;
      }
      sim.alphaTarget = 0;
      if (!reducedMotion) start();
    }
    dragId = null;
  }

  function onpointerup(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const g = gesture;
    if (g?.kind === "pinch") {
      if (pointers.size === 0) gesture = null;
      return;
    }
    if (!g || g.pointerId !== e.pointerId) return;
    if (g.kind === "node") {
      if (!g.moved && e.type === "pointerup") {
        gesture = null;
        dragId = null;
        if (g.id !== YOU) onopen(g.id);
        return;
      }
      releaseNode();
    }
    gesture = null;
    panning = false;
  }

  function onNodeKey(e: KeyboardEvent, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (id !== YOU) onopen(id);
    }
  }

  const graphNodes = $derived([
    { id: YOU, name: "Du / Gruppe", npc: null as Npc | null },
    ...npcs.map(n => ({ id: n.id, name: n.name, npc: n as Npc | null })),
  ]);
</script>

<div class="graph card">
  <div class="canvas" bind:clientWidth={w} bind:clientHeight={h}>
    <svg
      bind:this={svg}
      width={w}
      height={h}
      viewBox="0 0 {w || 1} {h || 1}"
      role="img"
      aria-label="Beziehungsnetz der NPCs"
      class:grabbing={panning || dragId !== null}
      {onpointerdown}
      {onpointermove}
      {onpointerup}
      onpointercancel={onpointerup}
    >
      <defs>
        {#each ATTITUDES as a (a.value)}
          <marker
            id="arr-{uid}-{a.value + 2}"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0.5 L10,5 L0,9.5 z" style="fill:{a.color}" />
          </marker>
        {/each}
      </defs>
      <g transform="translate({view.x},{view.y}) scale({view.k})">
        <g class="edges">
          {#each edgeGeoms as e (e.id)}
            <path
              d={e.d}
              class="edge {e.kind}"
              class:dim={e.dim}
              style="stroke:{attitudeColor(e.attitude)}"
              marker-end={e.kind === "rel" ? `url(#arr-${uid}-${e.attitude + 2})` : undefined}
            >
              <title>{e.title}</title>
            </path>
          {/each}
        </g>
        {#if showEdgeLabels}
          <g class="edge-labels">
            {#each edgeGeoms as e (e.id)}
              {#if e.kind === "rel" && e.label}
                <text x={e.lx} y={e.ly} class:dim={e.dim} dy="0.35em" style="font-size:{edgeLabelSize}px">{e.label.length > 28 ? e.label.slice(0, 27) + "…" : e.label}</text>
              {/if}
            {/each}
          </g>
        {/if}
        <g class="nodes">
          {#each graphNodes as n (n.id)}
            {@const p = pos.get(n.id)}
            {#if p}
              {@const r = radius(n.id)}
              {@const you = n.id === YOU}
              {@const dead = n.npc?.status === "dead"}
              <g
                data-node={n.id}
                class="node"
                class:you
                class:dead
                class:missing={n.npc?.status === "missing" || n.npc?.status === "unknown"}
                class:dim={neighbours !== null && !neighbours.has(n.id)}
                class:active={dragId === n.id}
                transform="translate({p.x},{p.y})"
                style="--c:{you ? 'var(--accent)' : dead ? 'var(--faint)' : attitudeColor(n.npc?.attitude ?? 0)}"
                role="button"
                tabindex={you ? -1 : 0}
                aria-label={you ? "Du / Gruppe" : `${n.name} öffnen`}
                onkeydown={e => onNodeKey(e, n.id)}
                onpointerenter={() => (hoverId = n.id)}
                onpointerleave={() => (hoverId = hoverId === n.id ? null : hoverId)}
              >
                <circle class="hit" r={r + 6} />
                <circle class="dot" {r} />
                <text class="initials" dy="0.36em" style="font-size:{you ? 13 : Math.round(r * 0.66)}px">
                  {you ? "Du" : initials(n.name)}
                </text>
                {#if showNodeLabels || you}
                  <text class="name" y={r + labelSize + 2} style="font-size:{labelSize}px">{you ? "Gruppe" : n.name}{dead ? " †" : ""}</text>
                {/if}
              </g>
            {/if}
          {/each}
        </g>
      </g>
    </svg>

    <div class="controls">
      <button class="btn btn-icon" aria-label="Vergrössern" onclick={() => zoomAt(1.25, w / 2, h / 2)}><Plus size={17} /></button>
      <button class="btn btn-icon" aria-label="Verkleinern" onclick={() => zoomAt(0.8, w / 2, h / 2)}><Minus size={17} /></button>
      <button class="btn btn-icon" aria-label="Ansicht zurücksetzen" title="Alles anzeigen" onclick={resetView}><Maximize2 size={16} /></button>
    </div>
    <p class="hint tiny faint">Ziehen zum Verschieben · Mausrad/Pinch zum Zoomen · Antippen öffnet</p>
  </div>

  <div class="legend tiny">
    <span class="lg"><span class="sw you-sw"></span>Du / Gruppe</span>
    {#each ATTITUDES as a (a.value)}
      <span class="lg"><span class="sw" style="--c:{a.color}"></span>{a.label}</span>
    {/each}
    <span class="lg"><span class="sw dead-sw"></span>Tot</span>
  </div>
</div>

<style>
  .graph { padding: 0; overflow: hidden; }
  .canvas {
    position: relative;
    height: calc(100dvh - 260px);
    min-height: 420px;
    background:
      radial-gradient(circle at 50% 45%, color-mix(in oklab, var(--accent) 6%, transparent), transparent 70%),
      var(--bg);
  }
  svg {
    display: block;
    position: absolute;
    inset: 0;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: grab;
  }
  svg.grabbing { cursor: grabbing; }

  .edge { fill: none; stroke-width: 1.7; transition: opacity 0.15s; }
  .edge.you { stroke-width: 1.4; stroke-dasharray: 2 5; stroke-linecap: round; opacity: 0.55; }
  .edge.rel { opacity: 0.85; }
  .edge.dim { opacity: 0.12; }

  .edge-labels text {
    font-weight: 550;
    text-anchor: middle;
    fill: var(--muted);
    stroke: var(--bg);
    stroke-width: 3.5px;
    stroke-linejoin: round;
    paint-order: stroke;
    pointer-events: none;
    transition: opacity 0.15s;
  }
  .edge-labels text.dim { opacity: 0.15; }

  .node { cursor: pointer; transition: opacity 0.15s; outline: none; }
  .node.dim { opacity: 0.28; }
  .hit { fill: transparent; }
  .dot {
    fill: color-mix(in oklab, var(--c) 24%, var(--surface));
    stroke: var(--c);
    stroke-width: 2.2;
    transition: stroke-width 0.12s;
  }
  .node:hover .dot,
  .node.active .dot,
  .node:focus-visible .dot { stroke-width: 3.5; }
  .node:focus-visible .hit { stroke: var(--accent); stroke-width: 2; stroke-dasharray: 3 3; }
  .initials {
    text-anchor: middle;
    font-weight: 700;
    fill: color-mix(in oklab, var(--c) 60%, var(--text));
    pointer-events: none;
    font-family: var(--font-display);
  }
  .name {
    font-weight: 600;
    text-anchor: middle;
    fill: var(--text);
    stroke: var(--bg);
    stroke-width: 3.5px;
    stroke-linejoin: round;
    paint-order: stroke;
    pointer-events: none;
  }
  .you .dot { fill: var(--accent-strong); stroke: var(--accent); stroke-width: 3; }
  .you .initials { fill: var(--accent-contrast); }
  .you .name { fill: var(--accent-text); }
  .dead .dot { stroke-dasharray: 4 3; fill: color-mix(in oklab, var(--faint) 18%, var(--surface)); }
  .dead .name { fill: var(--faint); }
  .dead .initials { fill: var(--faint); }
  .missing .dot { stroke-dasharray: 1.5 3.5; stroke-linecap: round; }

  .controls {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .controls .btn { background: color-mix(in oklab, var(--surface) 88%, transparent); backdrop-filter: blur(4px); }
  .hint {
    position: absolute;
    left: 0.75rem;
    top: 0.55rem;
    margin: 0;
    pointer-events: none;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.9rem;
    padding: 0.6rem 0.9rem;
    border-top: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
  }
  .lg { display: inline-flex; align-items: center; gap: 0.35rem; white-space: nowrap; }
  .sw {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    background: color-mix(in oklab, var(--c) 30%, var(--surface));
    border: 2px solid var(--c);
  }
  .you-sw { background: var(--accent-strong); border-color: var(--accent); }
  .dead-sw { --c: var(--faint); border-style: dashed; }
  @media (max-width: 767px) {
    .canvas { height: calc(100dvh - 360px); }
    .hint { display: none; }
  }
</style>
