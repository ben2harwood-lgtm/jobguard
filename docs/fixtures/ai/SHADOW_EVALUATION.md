# SV-3 held-out evaluation

The observation corpus and its labels are separate files. Detector/provider code receives observations, capture facts and recorded proposal responses, never labels. The evaluator completes predictions before reading labels and checks one-to-one case identities. These eleven synthetic cases are a small labelled fixture gate, not a statistically representative live-model evaluation.

Classes: genuine extras, contracted work, ambiguity, chat, alternative materials, duplicates, cancelled/unfinished requests, supplier spares, builder mistakes, already captured work, and one extra with three sources. Expected work identities, rather than source/proposal counts, determine true positives. Captures in ambiguous cases favour the builder. Deterministic and fixture-AI proposals run through the actual coalescing/matching path.

The committed expectation is TP 3, FP 0, FN 0. Recall and false-positive precision are printed separately with their numerator/denominator counts under `fixture`. `live-model: NOT RUN (separate release item)` is always distinct. No release threshold is invented; Q7 and approved-region live-model evaluation remain HELD. Fixture responses have no network/provider constructor or spend.

The root `pnpm eval` currently invokes the entire AI Vitest package. Under the dispatch memory limit the receipt runs it with only the two new SV-3 AI test files and `--maxWorkers=2`; the CLI can also be invoked directly after build. A broad package suite is owed to CI. The existing capture evaluation retains its original gates.
