import { COLORS } from './constants';
import type { Mechanic } from './types';

export interface MechanicInfo {
  label: string;
  hint: string;
  color: string;
  glyph: string;
  library: { name: string; description: string }[];
}

/** Presentation + offline narrative library. Rules and safe ranges live in shared/chaosSchema.js. */
export const MECHANIC_INFO: Record<Mechanic, MechanicInfo> = {
  reverse_controls: {
    label: 'REVERSE DAY',
    hint: 'Up is down. Left is right. Steer the opposite way.',
    color: COLORS.purple,
    glyph: '⇄',
    library: [
      { name: 'REVERSE DAY', description: 'The arena has decided your instincts are unreliable.' },
      { name: 'MIRROR MONDAY', description: 'Your keyboard has been replaced with a philosophical opposite.' },
      { name: 'OPPOSITE OFFICE', description: 'Management announced a bold new direction: every other one.' },
      { name: 'BRAIN SWAP', description: 'Your legs and your brain are no longer on speaking terms.' },
    ],
  },
  lava_tiles: {
    label: 'FLOOR IS LAVA',
    hint: 'Orange-outlined tiles ignite. Stay off the burning floor.',
    color: COLORS.orange,
    glyph: '▦',
    library: [
      { name: 'FLOOR IS LAVA', description: 'The floor has opinions, and they are extremely hot.' },
      { name: 'THE FLOOR DISAGREES', description: 'Certain tiles have filed a formal objection to feet.' },
      { name: 'HOT TILE SEASON', description: 'Real estate update: some squares are now volcanic.' },
      { name: 'SPICY GRID', description: 'Someone microwaved the arena. Mind the glowing bits.' },
    ],
  },
  treasure_storm: {
    label: 'TREASURE STORM',
    hint: 'Gold orbs are raining. Grab them before they vanish.',
    color: COLORS.gold,
    glyph: '✦',
    library: [
      { name: 'TREASURE STORM', description: 'Forecast: 100% chance of shiny things falling from nowhere.' },
      { name: 'GOLD RUSH HOUR', description: 'Loot is falling from the sky. Greed is now mandatory.' },
      { name: 'CLOUDY WITH LOOT', description: 'The weather machine is broken in your favour, for once.' },
      { name: 'JACKPOT DRIZZLE', description: 'The arena hit the jackpot and is throwing it at you.' },
    ],
  },
  chaos_magnet: {
    label: 'CHAOS MAGNET',
    hint: 'You get yanked toward orbs. Hazards drift toward you.',
    color: COLORS.cyan,
    glyph: '◎',
    library: [
      { name: 'CHAOS MAGNET', description: 'You are now extremely attractive. To everything. Sorry.' },
      { name: 'PERSONAL GRAVITY', description: 'Orbs want a hug. Unfortunately, so do the hazards.' },
      { name: 'MAGNETIC PERSONALITY', description: 'Your charm has become a measurable physical force.' },
      { name: 'POLARITY PANIC', description: 'Someone swapped your soul for a fridge magnet.' },
    ],
  },
  giant_mode: {
    label: 'GIANT MODE',
    hint: 'You are huge. Orbs are easy to grab. So are you.',
    color: COLORS.lime,
    glyph: '⬤',
    library: [
      { name: 'GIANT MODE', description: 'You ate something suspicious. Congratulations on your size.' },
      { name: 'BIG MOOD', description: 'Your hitbox has entered its main character era.' },
      { name: 'GROWTH SPURT', description: 'Puberty, but cosmic and extremely inconvenient.' },
      { name: 'TOO MUCH PROTEIN', description: 'Gains detected. Dodging is now a group activity.' },
    ],
  },
  speed_panic: {
    label: 'SPEED PANIC',
    hint: 'You are faster. Hazards spawn much more often.',
    color: COLORS.pink,
    glyph: '»',
    library: [
      { name: 'GRAVITY PANIC', description: 'Physics drank four espressos and is now vibrating.' },
      { name: 'SPEED PANIC', description: 'Everything is faster. Especially the bad things.' },
      { name: 'TURBO TUESDAY', description: 'The arena found the fast-forward button and sat on it.' },
      { name: 'CAFFEINE CRISIS', description: 'Your legs are fine. The hazards are not fine.' },
    ],
  },
  slow_motion: {
    label: 'SLOW-MOTION DRAMA',
    hint: 'The world slows down. Every point counts extra.',
    color: COLORS.cyan,
    glyph: '◷',
    library: [
      { name: 'SLOW-MOTION DRAMA', description: 'Cue the violins. Every second is now a movie trailer.' },
      { name: 'BULLET TIME', description: 'The hazards are thinking very hard about their choices.' },
      { name: 'DRAMATIC PAUSE', description: 'The arena is savouring this moment. Points are worth more.' },
      { name: 'SYRUP PHYSICS', description: 'Someone poured maple syrup into the space-time continuum.' },
    ],
  },
  disco_apocalypse: {
    label: 'DISCO APOCALYPSE',
    hint: 'Flashing rings explode on the beat. Get out of them.',
    color: COLORS.pink,
    glyph: '✺',
    library: [
      { name: 'DISCO APOCALYPSE', description: 'The dance floor is lethal and the DJ shows no mercy.' },
      { name: 'BOOM BOOM ROOM', description: 'Every beat drop is literal. Watch the glowing rings.' },
      { name: 'SATURDAY NIGHT FEVER', description: 'Temperature: dangerous. Groove: also dangerous.' },
      { name: 'BASS CANNON', description: 'The subwoofer has achieved sentience and aim.' },
    ],
  },
};
