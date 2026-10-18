import type { RoundStats } from './types';

interface TitleRule {
  test: (s: RoundStats) => boolean;
  title: string;
  subtitle: (s: RoundStats) => string;
}

// Ordered from most to least specific; the first matching rule wins.
const RULES: TitleRule[] = [
  { test: (s) => !s.won && s.survivalTime < 15, title: 'Speedrunning the Game Over Screen', subtitle: (s) => `Out in ${s.survivalTime.toFixed(1)}s. The arena barely got warmed up.` },
  { test: (s) => s.won && s.livesLost === 0, title: 'Physics Has Filed a Complaint', subtitle: (s) => `Survived ${s.eventsSurvived} chaos events without a scratch.` },
  { test: (s) => s.orbsCollected >= 30, title: 'Certified Chaos Magnet', subtitle: (s) => `${s.orbsCollected} orbs hoovered up. Greed is a strategy.` },
  { test: (s) => s.nearMisses >= 8, title: 'Professional Near-Miss Enthusiast', subtitle: (s) => `${s.nearMisses} close calls. Your heart rate has been noted.` },
  { test: (s) => s.dashes >= 25, title: 'Professional Button Masher', subtitle: (s) => `${s.dashes} dashes. The space bar would like a word.` },
  { test: (s) => s.won && s.livesLost === 2, title: 'Survivor by Accident', subtitle: () => 'One life left at the buzzer. Pure, unfiltered luck.' },
  { test: (s) => (s.hitsBy.lava_tiles ?? 0) >= 2, title: 'Professional Floor Tester', subtitle: () => 'You touched the lava. Repeatedly. On purpose?' },
  { test: (s) => (s.hitsBy.disco_apocalypse ?? 0) >= 2, title: 'Danced Too Close to the Speakers', subtitle: () => 'The disco won. The disco always wins.' },
  { test: (s) => s.won, title: 'Chaos Tamer, Probably', subtitle: (s) => `Made it to the end with ${s.orbsCollected} orbs and ${3 - s.livesLost} lives.` },
  { test: (s) => s.orbsCollected < 5, title: "The Arena's Unpaid Intern", subtitle: (s) => `${s.orbsCollected} orbs collected. Mostly here for the experience.` },
];

export function pickTitle(stats: RoundStats): { title: string; subtitle: string } {
  const rule = RULES.find((r) => r.test(stats));
  if (rule) return { title: rule.title, subtitle: rule.subtitle(stats) };
  return { title: 'Briefly Inconvenienced by Reality', subtitle: `Lasted ${stats.survivalTime.toFixed(1)}s against ${stats.eventsSurvived} chaos events.` };
}
