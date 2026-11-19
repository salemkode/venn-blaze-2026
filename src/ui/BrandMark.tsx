import React from 'react';
import Svg, { Circle, ClipPath, Defs, G } from 'react-native-svg';
import { MARK, brand, markCentres } from './brand';

const C = markCentres().map(([x, y]) => [500 + x, 500 + y]);

/** The shared centre of the three circles, filled. */
export function MarkLens({ size, color = brand.green, id = 'lens' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1000 1000">
      <Defs>
        <ClipPath id={`${id}0`}>
          <Circle cx={C[0][0]} cy={C[0][1]} r={MARK.radius} />
        </ClipPath>
        <ClipPath id={`${id}1`}>
          <Circle cx={C[1][0]} cy={C[1][1]} r={MARK.radius} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id}0)`}>
        <G clipPath={`url(#${id}1)`}>
          <Circle cx={C[2][0]} cy={C[2][1]} r={MARK.radius} fill={color} />
        </G>
      </G>
    </Svg>
  );
}

/** The Venn mark: three rings and their shared green centre. */
export default function BrandMark({ size = 32, ink = brand.ink, shared = brand.green, id = 'mark' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1000 1000">
      <Defs>
        <ClipPath id={`${id}0`}>
          <Circle cx={C[0][0]} cy={C[0][1]} r={MARK.radius} />
        </ClipPath>
        <ClipPath id={`${id}1`}>
          <Circle cx={C[1][0]} cy={C[1][1]} r={MARK.radius} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id}0)`}>
        <G clipPath={`url(#${id}1)`}>
          <Circle cx={C[2][0]} cy={C[2][1]} r={MARK.radius} fill={shared} />
        </G>
      </G>
      {C.map(([x, y]) => (
        <Circle key={`${x}`} cx={x} cy={y} r={MARK.radius} fill="none" stroke={ink} strokeWidth={MARK.stroke} />
      ))}
    </Svg>
  );
}
