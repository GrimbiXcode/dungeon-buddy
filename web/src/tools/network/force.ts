/**
 * Kleine, abhängigkeitsfreie Force-Simulation (angelehnt an d3-force):
 * Abstossung zwischen allen Knoten, Federn entlang der Kanten, leichte
 * Schwerkraft zur Mitte und Kollisionsvermeidung.
 */

export type SimNode = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** fixierte Position (z. B. beim Ziehen) */
  fx: number | null;
  fy: number | null;
};

export type SimLink = { source: number; target: number; distance: number; strength: number };

export class ForceSim {
  nodes: SimNode[];
  links: SimLink[];
  alpha = 1;
  alphaTarget = 0;
  alphaMin = 0.002;
  alphaDecay = 1 - Math.pow(0.002, 1 / 300);
  velocityDecay = 0.42;
  charge = -380;
  gravity = 0.02;
  /** Seitenverhältnis der Fläche (Höhe/Breite) – formt das Netz hoch- oder querformatig */
  aspect = 0.6;

  constructor(nodes: SimNode[], links: SimLink[]) {
    this.nodes = nodes;
    this.links = links;
  }

  get running() {
    return this.alpha >= this.alphaMin || this.alphaTarget > 0;
  }

  tick() {
    const { nodes, links } = this;
    const n = nodes.length;
    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay;
    const alpha = this.alpha;

    // Abstossung (O(n²) reicht für einige hundert Knoten)
    for (let i = 0; i < n; i++) {
      const a = nodes[i]!;
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) {
          dx = (Math.random() - 0.5) * 1e-3;
          dy = (Math.random() - 0.5) * 1e-3;
          d2 = dx * dx + dy * dy;
        }
        if (d2 > 640000) continue; // > 800px: vernachlässigbar
        const d = Math.sqrt(d2);
        const f = (this.charge * alpha) / Math.max(d, 12);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
        // Kollision
        const rr = a.r + b.r + 14;
        if (d < rr) {
          const push = ((rr - d) / d) * 0.5;
          a.vx -= dx * push * 0.5;
          a.vy -= dy * push * 0.5;
          b.vx += dx * push * 0.5;
          b.vy += dy * push * 0.5;
        }
      }
    }

    // Federn
    for (const l of links) {
      const a = nodes[l.source]!;
      const b = nodes[l.target]!;
      const dx = b.x + b.vx - a.x - a.vx || 1e-3;
      const dy = b.y + b.vy - a.y - a.vy || 1e-3;
      const d = Math.sqrt(dx * dx + dy * dy);
      const k = ((d - l.distance) / d) * alpha * l.strength;
      const fx = dx * k * 0.5;
      const fy = dy * k * 0.5;
      b.vx -= fx;
      b.vy -= fy;
      a.vx += fx;
      a.vy += fy;
    }

    // Schwerkraft zur Mitte
    const gx = this.gravity * Math.max(1, (this.aspect / 0.6) ** 2);
    const gy = this.gravity * Math.max(1, (0.6 / this.aspect) ** 2);
    for (const p of nodes) {
      p.vx -= p.x * gx * alpha;
      p.vy -= p.y * gy * alpha;
    }

    for (const p of nodes) {
      if (p.fx !== null && p.fy !== null) {
        p.x = p.fx;
        p.y = p.fy;
        p.vx = 0;
        p.vy = 0;
      } else {
        p.vx *= 1 - this.velocityDecay;
        p.vy *= 1 - this.velocityDecay;
        p.x += p.vx;
        p.y += p.vy;
      }
    }
  }

  /** Simuliert synchron bis zur Ruhe (für prefers-reduced-motion). */
  settle(maxTicks = 400) {
    for (let i = 0; i < maxTicks && this.alpha >= this.alphaMin; i++) this.tick();
  }
}

/** Startpositionen auf einer Spirale (deterministisch, gleichmässig verteilt). */
export function spiralPosition(i: number, spacing = 46) {
  const angle = i * 2.399963; // goldener Winkel
  const radius = spacing * Math.sqrt(i + 0.5);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}
