const ADJECTIVES = [
  "blue", "red", "green", "gold", "dark", "wild", "calm", "bold",
  "swift", "deep", "cool", "warm", "iron", "soft", "keen", "fair",
  "quick", "brave", "sharp", "clear", "prime", "grand", "pure", "fine",
];

const NOUNS = [
  "tiger", "eagle", "wolf", "hawk", "bear", "lion", "fox", "elk",
  "lynx", "crow", "stag", "bull", "pike", "owl", "ram", "orca",
  "viper", "falcon", "raven", "cobra", "shark", "panther", "drake", "heron",
];

export function generateWordCode(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${adj}-${noun}-${num}`;
}
