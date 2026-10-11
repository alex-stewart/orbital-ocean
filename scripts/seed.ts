import { seed, STEPS, type SeedStep } from './seed-lib';

// npm run seed -- <archipelagos | places [ids…] | platforms | all>
const [step, ...ids] = process.argv.slice(2);
if (!STEPS.includes(step as SeedStep)) {
  console.error(`Usage: npm run seed -- <${STEPS.join(' | ')}> [ids…]
  archipelagos       regenerate the belts' archipelagos (and their islands' places)
  places [ids…]      regenerate settlements on bodies or archipelagos (arch:…); all if none given
  platforms          re-site every platform where trade passes most often
  all                everything, in that order
Each overwrites the files it seeds, edits included.`);
  process.exit(1);
}
const started = Date.now();
for (const line of seed(process.cwd(), step as SeedStep, ids)) console.log(line);
console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
