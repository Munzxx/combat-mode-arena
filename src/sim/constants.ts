/** Fixed simulation step. The renderer may run at any frame rate; the sim always steps at 60 Hz. */
export const DT = 1 / 60;

/** Playable area in game pixels (the screen is 960x540). */
export const ARENA = { minX: 40, maxX: 920, minY: 60, maxY: 500 } as const;

/** Battles that last longer than this are decided on remaining health. */
export const MAX_TIME = 120;
