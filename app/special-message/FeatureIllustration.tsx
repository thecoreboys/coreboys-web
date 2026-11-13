import type { ReactNode } from "react";
import { CoreSymbolArt } from "@/components/brand/CoreSymbol";

export type FeatureKind = "home" | "guide" | "theater" | "networks" | "detection" | "multiview" | "remote";

const ink = "#64534e";
const paper = "#fffdf9";
const accent = "#963f59";
const rose = "#edc9ce";
const blue = "#c7d9e8";
const sage = "#c4d8c8";
const gold = "#efd49e";

function Window({ x, y, width, height, tilt = 0, children }: { x: number; y: number; width: number; height: number; tilt?: number; children: ReactNode }) {
  return <g transform={`translate(${x} ${y}) rotate(${tilt} ${width / 2} ${height / 2})`}>
    <rect width={width} height={height} rx="10" fill={paper} stroke={ink} strokeWidth="1.5" />
    <path d={`M1 23H${width - 1}`} stroke={ink} strokeOpacity=".35" />
    {[13, 21, 29].map(cx => <circle key={cx} cx={cx} cy="12" r="2" fill={ink} opacity=".5" />)}
    <rect x={width - 45} y="9" width="30" height="5" rx="2.5" fill={rose} />
    {children}
  </g>;
}

function Portrait({ x, y, width, height, color }: { x: number; y: number; width: number; height: number; color: string }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect width={width} height={height} rx="6" fill={color} />
    <path d={`M${width * .15} ${height}Q${width * .5} ${height * .25} ${width * .85} ${height}`} fill={ink} opacity=".18" />
    <circle cx={width * .5} cy={height * .4} r={Math.min(width, height) * .18} fill={paper} opacity=".85" />
    <path d={`M8 ${height - 8}H${width * .32}`} stroke={paper} strokeWidth="3" strokeLinecap="round" />
  </g>;
}

function Play({ x, y, radius = 15 }: { x: number; y: number; radius?: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <circle r={radius} fill={paper} stroke={ink} strokeWidth="1.3" />
    <path d="M-3-5 5 0-3 5Z" fill={accent} />
  </g>;
}

function Home() {
  return <>
    <Window x={42} y={30} width={276} height={150} tilt={-2}>
      <Portrait x={12} y={35} width={154} height={88} color={rose} />
      <Play x={89} y={78} />
      <Portrait x={178} y={35} width={85} height={39} color={blue} />
      <Portrait x={178} y={84} width={85} height={39} color={sage} />
      <rect x="13" y="133" width="101" height="5" rx="2.5" fill={ink} opacity=".35" />
      <rect x="178" y="133" width="64" height="5" rx="2.5" fill={ink} opacity=".2" />
    </Window>
    <g transform="translate(27 39) rotate(-8)"><rect width="60" height="24" rx="12" fill={accent} /><circle cx="13" cy="12" r="3" fill={paper} /><path d="M24 9h23M24 15h15" stroke={paper} strokeWidth="2" strokeLinecap="round" /></g>
  </>;
}

function Guide() {
  return <>
    <Window x={37} y={37} width={280} height={133} tilt={2}>
      {[84, 134, 184, 234].map(x => <path key={x} d={`M${x} 35v83`} stroke={ink} strokeOpacity=".12" />)}
      {[48, 75, 102].map((y, row) => <g key={y}>
        <circle cx="23" cy={y + 5} r="8" fill={[rose, sage, blue][row]} />
        <rect x="40" y={y + 2} width="29" height="5" rx="2.5" fill={ink} opacity=".25" />
      </g>)}
      <rect x="83" y="42" width="77" height="22" rx="5" fill={rose} /><rect x="166" y="42" width="97" height="22" rx="5" fill={gold} />
      <rect x="83" y="69" width="112" height="22" rx="5" fill={blue} /><rect x="201" y="69" width="62" height="22" rx="5" fill={sage} />
      <rect x="83" y="96" width="53" height="22" rx="5" fill={gold} /><rect x="142" y="96" width="121" height="22" rx="5" fill={rose} />
      <path d="M153 32v90" stroke={accent} strokeWidth="2" /><circle cx="153" cy="32" r="3" fill={accent} />
    </Window>
    <circle cx="302" cy="42" r="22" fill={paper} stroke={ink} strokeWidth="1.5" /><path d="M302 29v14l9 5" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
  </>;
}

function Theater() {
  return <>
    <Window x={31} y={34} width={297} height={139} tilt={-1}>
      <Portrait x={10} y={33} width={190} height={91} color={blue} />
      <Play x={105} y={78} radius={19} />
      <rect x="211" y="33" width="75" height="91" rx="6" fill="#f4eee5" />
      {[44, 65, 86].map((y, row) => <g key={y}><circle cx="222" cy={y + 3} r="4" fill={[rose, sage, gold][row]} /><path d={`M232 ${y}h42m-42 7h${row === 1 ? 23 : 32}`} stroke={ink} strokeWidth="2" strokeOpacity=".35" strokeLinecap="round" /></g>)}
    </Window>
    <path d="M151 173v12m-27 0h54" stroke={ink} strokeWidth="2" strokeLinecap="round" />
    <g transform="translate(276 136) rotate(7)"><rect width="54" height="33" rx="10" fill={rose} stroke={ink} strokeWidth="1.3" /><path d="m11 32-4 8 17-8" fill={rose} stroke={ink} strokeWidth="1.3" /><path d="M13 12h28M13 20h19" stroke={accent} strokeWidth="2" strokeLinecap="round" /></g>
  </>;
}

function Networks() {
  const nodes = [{ x: 67, y: 53, color: rose }, { x: 180, y: 30, color: blue }, { x: 293, y: 53, color: sage }, { x: 293, y: 151, color: gold }, { x: 180, y: 176, color: rose }, { x: 67, y: 151, color: blue }];
  return <>
    {nodes.map(({ x, y, color }) => <g key={`${x}-${y}`}>
      <path d={`M180 103Q${x} 103 ${x} ${y}`} fill="none" stroke={ink} strokeWidth="1.5" strokeDasharray="4 5" strokeOpacity=".45" />
      <rect x={x - 24} y={y - 18} width="48" height="36" rx="10" fill={paper} stroke={ink} strokeWidth="1.3" />
      <circle cx={x - 7} cy={y} r="9" fill={color} /><path d={`M${x + 7} ${y - 4}h9m-9 8h6`} stroke={ink} strokeWidth="2" strokeOpacity=".4" strokeLinecap="round" />
    </g>)}
    <circle cx="180" cy="103" r="37" fill={paper} stroke={ink} strokeWidth="1.5" />
    <g transform="translate(156 79) scale(.75)" color={accent}><CoreSymbolArt /></g>
  </>;
}

function Detection() {
  return <>
    <Window x={49} y={30} width={262} height={148} tilt={1}>
      <Portrait x={12} y={34} width={113} height={100} color={sage} /><Portrait x={137} y={34} width={113} height={100} color={rose} />
      {[44, 169].map((x, i) => <g key={x}>
        <path d={`M${x} 65v-17h14m17 0h14v17m0 14v17H${x + 32}m-18 0H${x}V79`} fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
        <rect x={x - 8} y="108" width="62" height="17" rx="8.5" fill={paper} /><circle cx={x + 2} cy="116.5" r="3" fill={i ? rose : sage} /><path d={`M${x + 11} 116.5h25`} stroke={ink} strokeWidth="2" strokeLinecap="round" />
      </g>)}
    </Window>
    <circle cx="306" cy="162" r="18" fill={paper} stroke={ink} strokeWidth="1.3" /><path d="m298 162 5 5 10-12" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </>;
}

function Multiview() {
  return <>
    <Window x={42} y={24} width={276} height={151} tilt={-1}>
      <Portrait x={12} y={34} width={121} height={47} color={rose} /><Portrait x={143} y={34} width={121} height={47} color={blue} />
      <Portrait x={12} y={91} width={121} height={47} color={gold} /><Portrait x={143} y={91} width={121} height={47} color={sage} />
      <rect x="11" y="33" width="123" height="49" rx="7" fill="none" stroke={accent} strokeWidth="2.5" />
    </Window>
    <path d="M180 176v13m-31 0h62" stroke={ink} strokeWidth="2" strokeLinecap="round" />
    <g transform="translate(286 142) rotate(5)"><rect width="43" height="33" rx="10" fill={paper} stroke={ink} strokeWidth="1.3" /><path d="M11 20v-6m7 10V10m7 12V12m7 7v-4" stroke={accent} strokeWidth="2.5" strokeLinecap="round" /></g>
  </>;
}

function Remote() {
  return <>
    <Window x={32} y={34} width={222} height={123} tilt={-2}>
      <Portrait x={10} y={33} width={96} height={34} color={rose} /><Portrait x={116} y={33} width={96} height={34} color={blue} />
      <Portrait x={10} y={76} width={96} height={34} color={gold} /><Portrait x={116} y={76} width={96} height={34} color={sage} />
    </Window>
    <path d="M139 157v16m-24 0h48" stroke={ink} strokeWidth="2" strokeLinecap="round" />
    <path d="M255 49q26-4 38 16m-34-29q37-7 48 23" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeDasharray="4 5" />
    <g transform="translate(267 70) rotate(5 29 57)">
      <rect width="58" height="112" rx="13" fill={paper} stroke={ink} strokeWidth="2" /><rect x="6" y="11" width="46" height="91" rx="7" fill="#f3e9df" />
      <rect x="19" y="5" width="20" height="3" rx="1.5" fill={ink} /><rect x="11" y="19" width="36" height="24" rx="4" fill={rose} />
      <Play x={29} y={62} radius={11} /><path d="M13 83h30m-30 7h21" stroke={ink} strokeWidth="2" strokeOpacity=".4" strokeLinecap="round" />
    </g>
    <g transform="translate(244 131)"><rect width="32" height="23" rx="7" fill={sage} stroke={ink} strokeWidth="1.1" /><path d="M8 9h16m-16 6h10" stroke={ink} strokeWidth="1.7" strokeLinecap="round" /></g>
  </>;
}

const scenes = { home: Home, guide: Guide, theater: Theater, networks: Networks, detection: Detection, multiview: Multiview, remote: Remote };

/** Decorative product illustrations share the letter’s warm paper palette. */
export function FeatureIllustration({ kind }: { kind: FeatureKind }) {
  const Scene = scenes[kind];
  const shadow = `story-feature-${kind}-shadow`;
  return <svg viewBox="0 0 360 204" width="360" height="204" fill="none" aria-hidden="true" focusable="false">
    <defs><filter id={shadow} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#836b59" floodOpacity=".12" /></filter></defs>
    <ellipse cx="181" cy="112" rx="132" ry="77" fill="#efe1d2" opacity=".55" />
    <path d="M18 159h17m-8-8v16M319 44h15m-7-7v14" stroke={ink} strokeWidth="1.3" strokeLinecap="round" strokeOpacity=".3" />
    <circle cx="26" cy="62" r="3" stroke={accent} strokeOpacity=".4" /><circle cx="334" cy="146" r="3" stroke={accent} strokeOpacity=".4" />
    <g filter={`url(#${shadow})`}><Scene /></g>
  </svg>;
}
