import React from 'react';

/**
 * NodeField — the deep-ocean network backdrop used behind the login screen.
 *
 * Pure SVG + CSS: no images, no WebGL, no network access. Static node/edge
 * geometry is generated once with a seeded PRNG so the layout is stable across
 * re-renders, and a few "data packets" animate along selected edges.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 1000;
const H = 620;

function buildNetwork() {
  const rnd = mulberry32(20261019);
  const nodes = [];
  for (let i = 0; i < 34; i++) {
    nodes.push({
      x: rnd() * W,
      y: rnd() * H,
      r: 1.4 + rnd() * 2.6,
      glow: rnd() > 0.72,
    });
  }

  // Connect every node to its two nearest neighbours -> organic mesh.
  const edges = [];
  nodes.forEach((n, i) => {
    const near = nodes
      .map((m, j) => ({ j, d: (m.x - n.x) ** 2 + (m.y - n.y) ** 2 }))
      .filter((c) => c.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    near.forEach((c) => {
      const key = i < c.j ? `${i}-${c.j}` : `${c.j}-${i}`;
      if (!edges.some((e) => e.key === key)) {
        edges.push({ key, x1: n.x, y1: n.y, x2: nodes[c.j].x, y2: nodes[c.j].y });
      }
    });
  });

  return { nodes, edges };
}

const NET = buildNetwork();

// Edges that carry an animated packet (roughly every 4th edge).
const PACKET_EDGES = NET.edges.filter((_, i) => i % 4 === 0).slice(0, 9);

export default function NodeField({ className = '' }) {
  return (
    <div className={`node-field ${className}`} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="nf-node" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#bfe9ff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.15" />
          </radialGradient>
          <linearGradient id="nf-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.05" />
            <stop offset="50%" stopColor="#67e8f9" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <g className="nf-edges">
          {NET.edges.map((e, i) => (
            <line
              key={e.key}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke="url(#nf-edge)"
              strokeWidth={i % 3 === 0 ? 1.1 : 0.6}
              style={{ animationDelay: `${(i % 11) * 0.42}s` }}
            />
          ))}
        </g>

        <g className="nf-nodes">
          {NET.nodes.map((n, i) => (
            <circle
              key={i}
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill="url(#nf-node)"
              className={n.glow ? 'nf-node-glow' : undefined}
              style={{ animationDelay: `${(i % 9) * 0.5}s` }}
            />
          ))}
        </g>

        <g className="nf-packets">
          {PACKET_EDGES.map((e, i) => (
            <circle key={e.key} r="2.2" fill="#7dd3fc" className="nf-packet">
              <animateMotion
                dur={`${3.2 + (i % 4) * 0.9}s`}
                repeatCount="indefinite"
                begin={`${i * 0.7}s`}
                path={`M${e.x1},${e.y1} L${e.x2},${e.y2}`}
              />
            </circle>
          ))}
        </g>
      </svg>

      {/* Drifting light shafts + rising bubbles for depth. */}
      <div className="nf-shaft nf-shaft-a" />
      <div className="nf-shaft nf-shaft-b" />
      <div className="nf-shaft nf-shaft-c" />
      <div className="nf-bubbles">
        {Array.from({ length: 18 }, (_, i) => (
          <span
            key={i}
            style={{
              left: `${(i * 37) % 96 + 2}%`,
              width: `${4 + (i % 4) * 2}px`,
              height: `${4 + (i % 4) * 2}px`,
              animationDuration: `${9 + (i % 6) * 2.2}s`,
              animationDelay: `${(i % 7) * 1.6}s`,
              opacity: 0.15 + (i % 5) * 0.06,
            }}
          />
        ))}
      </div>
    </div>
  );
}