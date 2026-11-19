// The Venn mark: three overlapping circles; the green they share is the money a Venn holds.
export const APP_NAME = 'Venn';

export const brand = {
  night: '#0B0B0D',
  nightTop: '#24242B',
  surface: '#17171C',
  line: '#2A2A30',
  ink: '#FFFFFF',
  soft: '#A4A4AB',
  faint: '#5E5E66',
  green: '#19D39B',
  greenInk: '#04140E',
};

// The mark in a 1000 box centred on (500, 500).
export const MARK = { offset: 112, radius: 228, stroke: 62 };

/** Centres of the three circles at the top, lower right and lower left. */
export function markCentres(offset = MARK.offset) {
  return [-90, 30, 150].map(deg => {
    const a = (deg * Math.PI) / 180;
    return [offset * Math.cos(a), offset * Math.sin(a)];
  });
}
