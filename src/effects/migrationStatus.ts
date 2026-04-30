export const GENERIC_WEAPON_MIGRATION_STATUS = {
  saber: {
    scalarConfig: true,
    behavior: false,
    render: false,
    lastVerified: 'baseline:generic-weapon-levels',
  },
  spear: {
    scalarConfig: true,
    behavior: false,
    render: false,
    lastVerified: 'baseline:generic-weapon-levels',
  },
  crossbow: {
    scalarConfig: true,
    behavior: false,
    render: false,
    lastVerified: 'baseline:generic-weapon-levels',
  },
  qinggang: {
    scalarConfig: false,
    behavior: false,
    render: false,
    lastVerified: 'shadow-only',
  },
  shield: {
    scalarConfig: false,
    behavior: false,
    render: false,
    lastVerified: 'shadow-only',
  },
  taiping: {
    scalarConfig: false,
    behavior: false,
    render: false,
    lastVerified: 'shadow-only',
  },
} as const;
