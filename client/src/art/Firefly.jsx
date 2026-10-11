import React, { useMemo } from 'react';
import { FIREFLY } from './firefly.js';
import { skinFor } from './palette.js';

const { body, eye, smile, antenna, wing, lantern } = FIREFLY;
let uid = 0;

/**
 * The menu-side firefly: the same character sheet as the arena, drawn as SVG so it stays
 * crisp at any size. Wing flutter and hover come from CSS, so they stop under
 * prefers-reduced-motion. No external image is fetched.
 */
export default function Firefly({ color = '#65F6D0', size = 64, className = '', idle = true, title }) {
  const skin = skinFor(color);
  const id = useMemo(() => `ff${++uid}`, []);
  const wingEl = side => (
    <ellipse
      className={`ff-wing ff-wing-${side > 0 ? 'r' : 'l'}`}
      cx={wing.dx * side + wing.rx * 0.5 * side}
      cy={wing.cy}
      rx={wing.rx}
      ry={wing.ry}
      transform={`rotate(${side * wing.tilt} ${wing.dx * side} ${wing.cy})`}
    />
  );
  return (
    <svg
      className={`ff-firefly ${idle ? 'is-idle' : ''} ${className}`}
      width={size}
      height={size * 1.32}
      viewBox="-54 -62 108 134"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
      style={{ '--ff-glow': skin.glow }}
    >
      <defs>
        <radialGradient id={`${id}-shell`} cx="34%" cy="26%" r="78%">
          <stop offset="0%" stopColor={skin.light} />
          <stop offset="45%" stopColor={skin.base} />
          <stop offset="100%" stopColor={skin.dark} />
        </radialGradient>
        <radialGradient id={`${id}-lamp`}>
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="32%" stopColor="#f2ffcf" />
          <stop offset="68%" stopColor="#c3f36d" />
          <stop offset="100%" stopColor="#c3f36d" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-halo`}>
          <stop offset="0%" stopColor={skin.glow} stopOpacity="0.42" />
          <stop offset="55%" stopColor={skin.glow} stopOpacity="0.1" />
          <stop offset="100%" stopColor={skin.glow} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="0" cy={lantern.cy - 2} r="62" fill={`url(#${id}-halo)`} />

      <g className="ff-wings" fill="#eaf6ff" fillOpacity="0.42" stroke="rgba(214,240,255,.5)" strokeWidth="1.4">
        {wingEl(-1)}
        {wingEl(1)}
      </g>

      <g className="ff-torso">
        <g stroke={skin.dark} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d={`M${-antenna.dx} ${antenna.top} Q${-antenna.tipX * 1.15} ${antenna.top - 10} ${-antenna.tipX} ${antenna.tipY}`} />
          <path d={`M${antenna.dx} ${antenna.top} Q${antenna.tipX * 1.15} ${antenna.top - 10} ${antenna.tipX} ${antenna.tipY}`} />
        </g>
        <circle cx={-antenna.tipX} cy={antenna.tipY} r={antenna.tipR} fill={skin.light} />
        <circle cx={antenna.tipX} cy={antenna.tipY} r={antenna.tipR} fill={skin.light} />

        <ellipse cx={body.cx} cy={body.cy} rx={body.rx} ry={body.ry} fill={`url(#${id}-shell)`} stroke={skin.dark} strokeWidth="2.4" />
        <path
          d={`M${-body.rx + 2.6} ${body.cy} A${body.rx - 2.6} ${body.ry - 2.6} 0 0 1 ${-7} ${body.cy - body.ry + 3.4}`}
          fill="none"
          stroke={skin.light}
          strokeOpacity="0.55"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <ellipse className="ff-lamp" cx="0" cy={lantern.cy} rx={lantern.rx + 4} ry={lantern.ry + 4} fill={`url(#${id}-lamp)`} />

        <g fill="#0a1a2e">
          <ellipse cx={-eye.dx} cy={eye.cy} rx={eye.r} ry={eye.r * 1.06} />
          <ellipse cx={eye.dx} cy={eye.cy} rx={eye.r} ry={eye.r * 1.06} />
        </g>
        <g fill="rgba(255,255,255,.9)">
          <circle cx={-eye.dx - 1.4} cy={eye.cy - 1.5} r={eye.shine} />
          <circle cx={eye.dx - 1.4} cy={eye.cy - 1.5} r={eye.shine} />
        </g>
        <path
          d={`M${-smile.dx} ${smile.cy} Q0 ${smile.cy + smile.drop} ${smile.dx} ${smile.cy}`}
          fill="none"
          stroke="rgba(10,26,46,.75)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
