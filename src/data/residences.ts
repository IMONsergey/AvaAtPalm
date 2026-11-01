export const residences = [
  { unit: '801', bedrooms: 3, parking: 3, internal: '4,829', external: '1,816', total: '6,645', plan: 'plan-801', orientation: 'orientation-801', floor: 'floor-801' },
  { unit: '1601', bedrooms: 4, parking: 3, internal: '6,625', external: '2,132', total: '8,757', plan: 'plan-1601', orientation: 'orientation-1601', floor: 'floor-1601' },
] as const;
export type Residence = (typeof residences)[number];
