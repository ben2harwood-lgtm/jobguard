# MON3 migration renumber preservation

Ben approved this exact three-path archive-first sequence on26October2026 (msg_01a17853-5052-7d21-a239-17e69beaae05). This archive preserves the exact two committed0206 originals from0b523164, before their removal is recorded in the later renumber checkpoint. ZIP opens and both members compare byte-for-byte to that commit; SHA256 values are in MANIFEST.json. The SQL at0235 is byte-identical; the0235 note changes only its number references.

This archive is committed separately before any oldpath deletion is staged. No migration/database execution, source redesign, test weakening, product acceptance, main merge or live activation occurs here. The existing scoped source/CI/independent-review/acceptance gates remain.
