# Spoken quote red-team findings

One row per finding. Codex adds rows in its attack PRs; fix PRs change the status. Claude mirrors open P0/P1
to the tracking issue and to the V2 planner.

Severity: **P0** wrong money (invented, wrong sign, qualified kept as fixed) or wrong firm or job.
**P1** lost, doubled or misplaced item or price; crash; over 1 s. **P2** confusing but safe.

| ID | Lane | Head sha | Case id | Transcript | Expected | Actual | Sev | Status | Fix PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RT-00-F001 | RT-00 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-00-002 | Fit the door for a hundred and fifty pound | One line priced 15000 pence | Capture and Reader A leave the price null; singular pound is not read as exact money | P1 | open | — |
| RT-00-F002 | RT-00 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-00-003 | Paint the kitchen £400, no, make that £450 | One open line with a question (or 45000 with a question); never 40000 | Capture keeps 40000 and adds a second “make that” line priced 45000, with no correction question; Reader A safely opens one line | P0 | fixed (local tests; golden gate held) | RT-FIX-2 / #1071 (commit only) |
| RT-00-F003 | RT-00 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-00-005 | Run 15mm pipe to the rad £120 | One line priced 12000; diameter never becomes a count | Capture leaves the price null; Reader A correctly keeps 12000 with quantity null | P1 | open | — |
| RT-01-F002 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-002 | Fit the door for one pound | One line priced 100 pence; never 1, 1000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F003 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-003 | Fit the door for a pound | One line priced 100 pence; never 1, 1000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F032 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-032 | Fit the door for one-hundred-and-fifty pounds | One line priced 15000 pence; never 150, 150000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F034 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-034 | Fit the door for a hundred and fifty pound | One line priced 15000 pence; never 150, 150000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F035 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-035 | Fit the door for one hundred and fifty pound | One line priced 15000 pence; never 150, 150000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F036 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-036 | Fit the door for fifty pound | One line priced 5000 pence; never 50, 50000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F037 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-037 | Fit the door for two hundred pound | One line priced 20000 pence; never 200, 200000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F038 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-038 | Fit the door for twelve hundred pound | One line priced 120000 pence; never 1200, 1200000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F039 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-039 | Fit the door for one thousand pound | One line priced 100000 pence; never 1000, 1000000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F040 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-040 | Fit the door for ninety-nine pound | One line priced 9900 pence; never 99, 99000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F041 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-041 | Fit the door for 150 pound | One line priced 15000 pence; never 150, 150000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F044 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-044 | Fit the door for fifteen hundred pound | One line priced 150000 pence; never 1500, 1500000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F045 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-045 | Fit the door for one hundred and one pound | One line priced 10100 pence; never 101, 101000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F046 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-046 | Fit the door for one fifty | One unpriced line and an explicit price question; never 150, 5100, 15000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F047 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-047 | Fit the door for one-fifty | One unpriced line and an explicit price question; never 150, 5100, 15000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F050 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-050 | Fit the door for two fifty | One unpriced line and an explicit price question; never 25000, 5200 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F051 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-051 | Fit the door for four fifty | One unpriced line and an explicit price question; never 45000, 5400 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F052 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-052 | Fit the door for one twenty | One unpriced line and an explicit price question; never 12000, 2100 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F053 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-053 | Fit the door for five twenty | One unpriced line and an explicit price question; never 52000, 2500 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F054 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-054 | Fit the door for hundred and fifty | One unpriced line and an explicit price question; never 15000, 5000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F055 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-055 | Fit the door for hundred and fifty pounds | One line priced 15000 pence; never 150, 1500, 5000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F056 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-056 | Fit the door for fifteen | One unpriced line and an explicit price question; never 1500, 150000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F057 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-057 | Fit the door for one five zero | One unpriced line and an explicit price question; never 15000, 600 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F059 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-059 | Fit the door for a hundred fifty | One unpriced line and an explicit price question; never 15000, 5000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F060 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-060 | Fit the door for three grand | One line priced 300000 pence; never 300, 3000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F061 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-061 | Fit the door for a grand | One line priced 100000 pence; never 100, 1000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F062 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-062 | Fit the door for one grand | One line priced 100000 pence; never 100, 1000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F063 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-063 | Fit the door for six grand | One line priced 600000 pence; never 600, 6000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F064 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-064 | Fit the door for twelve grand | One line priced 1200000 pence; never 1200, 12000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F065 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-065 | Fit the door for 3k | One line priced 300000 pence; never 300, 3000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [300000] | P1 | open | — |
| RT-01-F066 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-066 | Fit the door for 3.5k | One line priced 350000 pence; never 350, 3500 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [350000] | P1 | open | — |
| RT-01-F067 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-067 | Fit the door for 4.5k | One line priced 450000 pence; never 450, 4500 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [450000] | P1 | open | — |
| RT-01-F068 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-068 | Fit the door for 3K | One line priced 300000 pence; never 300, 3000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [300000] | P1 | open | — |
| RT-01-F069 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-069 | Fit the door for 3 k | One line priced 300000 pence; never 300, 3000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [300000] | P1 | open | — |
| RT-01-F070 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-070 | Fit the door for 6 grand | One line priced 600000 pence; never 600, 6000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [600000] | P1 | open | — |
| RT-01-F071 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-071 | Fit the door for 0.5k | One line priced 50000 pence; never 50, 500 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [50000] | P1 | open | — |
| RT-01-F072 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-072 | Fit the door for 1.050k | One line priced 105000 pence; never 105, 1050 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F073 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-073 | Fit the door for two and a half grand | One unpriced line and an explicit price question; never 200000, 250, 250000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F074 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-074 | Fit the door for half a grand | One unpriced line and an explicit price question; never 100000, 50000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F075 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-075 | Fit the door for three and a quarter grand | One unpriced line and an explicit price question; never 300000, 325000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F076 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-076 | Fit the door for one point five grand | One unpriced line and an explicit price question; never 100000, 500000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F077 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-077 | Fit the door for a couple of grand | One unpriced line and an explicit price question; never 200000, 100000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F078 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-078 | Fit the door for three grand fifty | One unpriced line and an explicit price question; never 300000, 305000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F079 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-079 | Fit the door for a ton | One unpriced line and an explicit price question; never 10000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F080 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-080 | Fit the door for a monkey | One unpriced line and an explicit price question; never 50000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F081 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-081 | Fit the door for a pony | One unpriced line and an explicit price question; never 2500 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F082 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-082 | Fit the door for a score | One unpriced line and an explicit price question; never 2000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F083 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-083 | Fit the door for a bag of sand | One unpriced line and an explicit price question; never 100000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F084 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-084 | Fit the door for two ton | One unpriced line and an explicit price question; never 20000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F085 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-085 | Fit the door for three monkeys | One unpriced line and an explicit price question; never 150000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F086 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-086 | Fit the door for fifty notes | One unpriced line and an explicit price question; never 5000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F087 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-087 | Fit the door for one hundred notes | One unpriced line and an explicit price question; never 10000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F088 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-088 | Fit the door for a hundred and fifty squid | One unpriced line and an explicit price question; never 15000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F089 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-089 | Fit the door for 150 squid | One unpriced line and an explicit price question; never 15000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F094 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-094 | Fit the door for £1 500 | One line priced 150000 pence; never 150, 1500, 1500000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F102 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-102 | Fit the door for £00150 | One line priced 15000 pence; never 150, 1500, 1500000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F103 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-103 | Fit the door for £0150.50 | One line priced 15050 pence; never 150, 1500, 1500000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F104 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-104 | Fit the door for £ 150 | One line priced 15000 pence; never 150, 1500, 1500000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F112 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-112 | Fit the door for £1.500 | One unpriced line and an explicit price question; never 150, 1500, 150000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F113 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-113 | Fit the door for £150.999 | One unpriced line and an explicit price question; never 15000, 15099, 150100 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F114 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-114 | Fit the door for £1,2000 | One unpriced line and an explicit price question; never 1200000, 120000, 200000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F115 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-115 | Fit the door for £15,00 | One unpriced line and an explicit price question; never 150000, 1500, 0 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F116 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-116 | Fit the door for £1,,500 | One unpriced line and an explicit price question; never 100, 50000, 150000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F117 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-117 | Fit the door for £1,50.00 | One unpriced line and an explicit price question; never 15000, 5000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F118 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-118 | Fit the door for £150,50 | One unpriced line and an explicit price question; never 15050, 15000, 5000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F119 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-119 | Fit the door for £.50 | One unpriced line and an explicit price question; never 50, 5000 pence | Capture: 2 line(s), pence [null, null]; no explicit price question; descriptions ["Fit the door for £", "50"]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F120 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-120 | Fit the door for £1.2.3 | One unpriced line and an explicit price question; never 120, 123, 300 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F121 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-121 | Fit the door for £150..50 | One unpriced line and an explicit price question; never 15000, 15050, 5000 pence | Capture: 2 line(s), pence [15000, null]; no explicit price question; descriptions ["Fit the door", "50"]; Reader A: 1 line(s), pence [15000] | P0 | fixed | RT-FIX-3 (#1071; local commit) |
| RT-01-F123 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-123 | Fit the door for £1<NBSP U+00A0>500 | One line priced 150000 pence; never 100, 50000, 1500 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F124 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-124 | Fit the door for £1<NNBSP U+202F>500 | One line priced 150000 pence; never 100, 50000, 1500 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F125 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-125 | Fit the door for £<NBSP U+00A0>150 | One line priced 15000 pence; never 100, 50000, 1500 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F126 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-126 | Fit the door for £<NNBSP U+202F>150 | One line priced 15000 pence; never 100, 50000, 1500 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F127 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-127 | Fit the door for £1<THIN SPACE U+2009>500 | One line priced 150000 pence; never 100, 50000, 1500 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F128 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-128 | Fit the door for £１５０ | One unpriced line and an explicit price question; never 1, 5, 10, 150 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F129 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-129 | Fit the door for £١٥٠ | One unpriced line and an explicit price question; never 1, 5, 10, 150 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F130 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-130 | Fit the door for £۱۵۰ | One unpriced line and an explicit price question; never 1, 5, 10, 150 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F131 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-131 | Fit the door for £1５0 | One unpriced line and an explicit price question; never 100, 500, 0 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F132 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-132 | Fit the door for £１５０.５０ | One unpriced line and an explicit price question; never 150, 5000 pence | Capture: 2 line(s), pence [null, null]; no explicit price question; descriptions ["Fit the door for £１５０", "５０"]; Reader A: 2 line(s), pence [null, null]; no explicit price question; descriptions ["Fit the door for £１５０", "５０"] | P1 | open | — |
| RT-01-F133 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-133 | Fit the door for £1<ZWSP U+200B>500 | One unpriced line and an explicit price question; never 100, 50000 pence | Capture: 1 line(s), pence [100]; no explicit price question; Reader A: 1 line(s), pence [null] | P0 | fixed | RT-FIX-3 (#1071; local commit) |
| RT-01-F134 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-134 | Fit the door for £1<WORD JOINER U+2060>500 | One unpriced line and an explicit price question; never 100, 50000 pence | Capture: 1 line(s), pence [100]; no explicit price question; Reader A: 1 line(s), pence [null] | P0 | fixed | RT-FIX-3 (#1071; local commit) |
| RT-01-F135 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-135 | Fit the door for £-150 | One unpriced line and an explicit price question; never 15000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F136 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-136 | Fit the door for £−150 | One unpriced line and an explicit price question; never 15000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F140 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-140 | Fit the door for less 150 | One unpriced line and an explicit price question; never 15000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F141 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-141 | Fit the door for take off 150 | One unpriced line and an explicit price question; never 15000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F142 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-142 | Fit the door for take off £150 | One unpriced line and an explicit price question; never 15000 pence | Capture: 1 line(s), pence [15000]; no explicit price question; Reader A: 1 line(s), pence [15000]; no explicit price question | P0 | fixed | RT-FIX-3 (#1071; local commit) |
| RT-01-F143 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-143 | Fit the door for knock off 150 pounds | One unpriced line and an explicit price question; never 15000 pence | Capture: 1 line(s), pence [15000]; no explicit price question; Reader A: 1 line(s), pence [15000]; no explicit price question | P0 | fixed | RT-FIX-3 (#1071; local commit) |
| RT-01-F144 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-144 | Fit the door for a deduction of £150 | One unpriced line and an explicit price question; never 15000 pence | Capture: 1 line(s), pence [15000]; no explicit price question; Reader A: 1 line(s), pence [15000]; no explicit price question | P0 | fixed | RT-FIX-3 (#1071; local commit) |
| RT-01-F145 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-145 | Fit the door for (£150) | One unpriced line and an explicit price question; never 15000 pence | Capture: 1 line(s), pence [15000]; no explicit price question; Reader A: 1 line(s), pence [null] | P0 | fixed | RT-FIX-3 (#1071; local commit) |
| RT-01-F146 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-146 | Fit the door for £150- | One unpriced line and an explicit price question; never 15000 pence | Capture: 1 line(s), pence [15000]; no explicit price question; Reader A: 1 line(s), pence [null] | P0 | fixed | RT-FIX-3 (#1071; local commit) |
| RT-01-F147 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-147 | Fit the door for £-1,500.50 | One unpriced line and an explicit price question; never 150050 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F148 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-148 | Fit the door for minus a hundred and fifty pound | One unpriced line and an explicit price question; never 15000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F151 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-151 | Fit the door for one pound and one penny | One line priced 101 pence; never 2000, 205000, 505000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F152 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-152 | Fit the door for one pound and five pence | One line priced 105 pence; never 2000, 205000, 505000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F165 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-165 | Fit the door for 50p | One line priced 50 pence; never 5000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F166 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-166 | Fit the door for fifty pence | One line priced 50 pence; never 5000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F168 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-168 | Fit the door for £20.505 | One unpriced line and an explicit price question; never 2050, 2051, 2000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F169 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-169 | Fit 2 doors 150 | One unpriced line and an explicit price question; never 2150, 15000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F170 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-170 | Fit 2 doors at 150 | One line priced 15000 pence; never 2150, 215000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [15000] | P1 | open | — |
| RT-01-F173 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-173 | Fit 6 150 pound doors | One unpriced line and an explicit price question; never 615000, 15000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F174 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-174 | Paint room 4 for £300 | One line priced 30000 pence in Room 4; never 430000, 40000 pence | Capture: 1 line(s), pence [30000]; Reader A: 1 line(s), pence [30000]; room stays Whole job | P1 | open | — |
| RT-01-F175 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-175 | Room 4 £300 for painting | One line priced 30000 pence in Room 4; never 430000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null]; room stays Whole job | P1 | open | — |
| RT-01-F177 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-177 | Fit the door in flat 12 £300 | One line priced 30000 pence; never 1230000, 120000 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F180 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-180 | Fit the door 8 till 4, 150 | One unpriced line and an explicit price question; never 8415000, 15000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F182 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-182 | Fit the door 2 days 300 | One unpriced line and an explicit price question; never 230000, 30000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null] | P2 | open | — |
| RT-01-F187 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-187 | Fit the door for £150 on the 3rd | One line priced 15000 pence; never 315000, 300 pence | Capture: 1 line(s), pence [15000]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F188 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-188 | Fit the door for £150, start at 8 | One line priced 15000 pence; never 150800, 800 pence | Capture: 1 line(s), pence [15000]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F190 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-190 | Fit kitchen units for three grand | One line priced 300000 pence; never 300 pence | Capture: 1 line(s), pence [null]; Reader A: 1 line(s), pence [null] | P1 | open | — |
| RT-01-F191 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-191 | Fit kitchen units two and a half grand | One unpriced line and an explicit price question; never 200000, 250 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |
| RT-01-F192 | RT-01 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-01-192 | Fit the door a ton | One unpriced line and an explicit price question; never 10000 pence | Capture: 1 line(s), pence [null]; no explicit price question; Reader A: 1 line(s), pence [null]; no explicit price question | P2 | open | — |

## RT-FIX-2 receipt (28 Nov 2026, #1071)

Changed `packages/ai/src/capture-fixture-parser.ts`, the RT-03 correction seed corpus, RT-00-003's status,
this findings file, and `config/lanes/v2-rt-fix-2.json`. The already-staged RT-00 runner and plan files
are included unchanged. No push, live model, paid API, deployment, database or browser action.

One shared correction-marker guard keeps corrections attached before splitting and feeds the existing
`saidAmountOpen` price guard. The capture price stays null and an explicit question says a spoken
correction was made. It never chooses between the old and new figures. The 24 corpus cases cover
`no make that`, `actually`, `sorry I mean`, `scratch that`, `not X Y`, `change that to`, `or rather`,
and `call it X instead`, including omitted replacement currency, punctuation, unpunctuated speech,
and an independent following item. Original source words and citation offsets are retained.

Before → after:

| Check | Before | After |
| --- | --- | --- |
| Existing AI suite | 28 files, 508 tests pass | 528 pass / 4 fail out of 532 including 24 new cases; all four failures are the unchanged golden hash gate |
| RT-00 corpus | 2 pass / 3 open | 3 pass / 2 open (F001 and F003 unchanged) |
| New RT-03 regressions | 12 pass / 12 fail against original parser | 24 pass / 0 open; explicit capture correction questions checked on 24/24 |
| Qualified-price tests (unchanged) | 19/19 | 19/19 |
| Capture evaluation | 32/32 cases; scope 41/41; citations 119/119; ambiguities 63/63; unsupported money 0 | Identical |
| Reader A main set | 30 cases; room 82/82; trade 82/82; wrong numbers 0; invented work 0; missed work 0; questions 15/15 | Identical |
| Reader A held-out 1 | 10 cases; room 30/40; trade 28/40; wrong numbers 0; invented work 0; missed work 9; missed numbers 3; questions 7/9 | Identical |
| Reader A held-out 2 | 10 cases; room 15/30; trade 14/30; wrong numbers 0; invented work 0; missed work 9; missed numbers 8; questions 2/4 | Identical |
| RT-02-F012 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-012 | Fit the boiler £2,500 VAT on top | One Fit the boiler line; price 250000 pence; question about VAT; never 300000, 208333 pence; no area/whole-job total | Capture: 1 line(s), prices [250000]; requested question present; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F013 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-013 | Fit the boiler £2,500 with VAT included | One Fit the boiler line; price 250000 pence; question about VAT; never 300000, 208333 pence; no area/whole-job total | Capture: 1 line(s), prices [250000]; requested question present; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F014 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-014 | Fit the boiler £2,500 VAT included | One Fit the boiler line; price 250000 pence; question about VAT; never 300000, 208333 pence; no area/whole-job total | Capture: 1 line(s), prices [250000]; requested question present; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F015 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-015 | Fit the boiler £2,500 inclusive | One Fit the boiler line; price 250000 pence; question about VAT; never 300000, 208333 pence; no area/whole-job total | Capture: 1 line(s), prices [250000]; no question about VAT; Reader A: 1 line(s), prices [null]; no question about VAT; Checked Reader A unchanged | P1 | open | — |
| RT-02-F016 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-016 | Fit the boiler £2,500 VAT exclusive | One Fit the boiler line; price 250000 pence; question about VAT; never 300000, 208333 pence; no area/whole-job total | Capture: 1 line(s), prices [250000]; requested question present; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F017 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-017 | Fit the boiler £2,500 before VAT | One Fit the boiler line; price 250000 pence; question about VAT; never 300000, 208333 pence; no area/whole-job total | Capture: 1 line(s), prices [250000]; requested question present; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F018 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-018 | Fit the boiler £2,500 after VAT | One Fit the boiler line; price 250000 pence; question about VAT; never 300000, 208333 pence; no area/whole-job total | Capture: 1 line(s), prices [250000]; requested question present; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F019 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-019 | Fit the boiler £2,500 VAT payable separately | One Fit the boiler line; price 250000 pence; question about VAT; never 300000, 208333 pence; no area/whole-job total | Capture: 1 line(s), prices [250000]; requested question present; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F020 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-020 | Fit the boiler £2,500 net of VAT | One Fit the boiler line; price 250000 pence; question about VAT; never 300000, 208333 pence; no area/whole-job total | Capture: 1 line(s), prices [250000]; requested question present; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F021 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-021 | Fit the boiler, I am not VAT registered, £2,500 | One Fit the boiler line; price 250000 pence; question about VAT; never 300000, 208333 pence; no area/whole-job total | Capture: 1 line(s), prices [250000]; no question about VAT; Reader A: 1 line(s), prices [250000]; no question about VAT; Checked Reader A unchanged | P2 | open | — |
| RT-02-F022 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-022 | Fit the boiler, I'm not VAT registered, £2,500 | One Fit the boiler line; price 250000 pence; question about VAT; never 300000, 208333 pence; no area/whole-job total | Capture: 1 line(s), prices [250000]; no question about VAT; Reader A: 1 line(s), prices [250000]; no question about VAT; Checked Reader A unchanged | P2 | open | — |
| RT-02-F023 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-023 | Fit the boiler, No VAT on this work, £2,500 | One Fit the boiler line; price 250000 pence; question about VAT; never 300000, 208333 pence; no area/whole-job total | Capture: 1 line(s), prices [250000]; no question about VAT; Reader A: 1 line(s), prices [250000]; no question about VAT; Checked Reader A unchanged | P2 | open | — |
| RT-02-F024 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-024 | Fit the boiler, Price includes VAT, £2,500 | One Fit the boiler line; price 250000 pence; question about VAT; never 300000, 208333 pence; no area/whole-job total | Capture: 1 line(s), prices [250000]; no question about VAT; Reader A: 1 line(s), prices [250000]; no question about VAT; Checked Reader A unchanged | P2 | open | — |
| RT-02-F025 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-025 | Fit the boiler with the VAT that is £180 | One Fit the boiler line; price 18000 pence; question about VAT; no area/whole-job total | Capture: 1 line(s), prices [18000]; no question about VAT; Reader A: 1 line(s), prices [18000]; no question about VAT; Checked Reader A unchanged | P2 | open | — |
| RT-02-F026 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-026 | Paint the fence £600 with twenty percent off | One Paint the fence line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [60000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F027 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-027 | Tile the floor £800 with a 20% discount | One Tile the floor line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [80000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F028 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-028 | Fit the radiator £120 +VAT | One Fit the radiator line; price 12000 pence; question about VAT; no area/whole-job total | Capture: 1 line(s), prices [12000]; requested question present; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F029 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-029 | Tile the bathroom £1,200 plus materials | One Tile the bathroom line; price 120000 pence; question about materials; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about materials; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F030 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-030 | Tile the bathroom £1,200 labour only | One Tile the bathroom line; price 120000 pence; question about labour; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about labour; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F031 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-031 | Tile the bathroom £1,200 plus the materials | One Tile the bathroom line; price 120000 pence; question about materials; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about materials; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F032 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-032 | Tile the bathroom £1,200 excluding materials | One Tile the bathroom line; price 120000 pence; question about materials; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about materials; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F033 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-033 | Tile the bathroom £1,200 materials extra | One Tile the bathroom line; price 120000 pence; question about materials; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about materials; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F034 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-034 | Tile the bathroom £1,200 materials at cost | One Tile the bathroom line; price 120000 pence; question about materials; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about materials; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F035 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-035 | Tile the bathroom £1,200 plus materials at cost | One Tile the bathroom line; price 120000 pence; question about materials; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about materials; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F036 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-036 | Tile the bathroom £1,200 labour only with materials at cost | One Tile the bathroom line; price 120000 pence; question about labour; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about labour; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F037 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-037 | Tile the bathroom £1,200 plus skip | One Tile the bathroom line; price 120000 pence; question about skip; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about skip; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F038 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-038 | Tile the bathroom £1,200 plus scaffold | One Tile the bathroom line; price 120000 pence; question about scaffold; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about scaffold; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F039 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-039 | Tile the bathroom £1,200 plus delivery | One Tile the bathroom line; price 120000 pence; question about delivery; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about delivery; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F040 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-040 | Tile the bathroom £1,200 plus waste removal | One Tile the bathroom line; price 120000 pence; question about waste; no area/whole-job total | Capture: 1 line(s), prices [120000]; requested question present; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F041 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-041 | Tile the bathroom £1,200 supply only | One Tile the bathroom line; price 120000 pence; question about supply; no area/whole-job total | Capture: 2 line(s), prices [120000, null], descriptions ["Tile the bathroom", "supply only"]; no question about supply; Reader A: 2 line(s), prices [120000, null], descriptions ["Tile the bathroom", "supply only"]; no question about supply; Checked Reader A unchanged | P1 | open | — |
| RT-02-F042 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-042 | Tile the bathroom £1,200 materials only | One Tile the bathroom line; price 120000 pence; question about materials; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about materials; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F043 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-043 | Tile the bathroom £1,200 excluding labour | One Tile the bathroom line; price 120000 pence; question about labour; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about labour; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F044 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-044 | Tile the bathroom £1,200 plus labour | One Tile the bathroom line; price 120000 pence; question about labour; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about labour; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F045 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-045 | Tile the bathroom £1,200 labour extra | One Tile the bathroom line; price 120000 pence; question about labour; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about labour; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F046 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-046 | Tile the bathroom £1,200 plus fixings | One Tile the bathroom line; price 120000 pence; question about fixings; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about fixings; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F047 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-047 | Tile the bathroom £1,200 with materials to be agreed | One Tile the bathroom line; price 120000 pence; question about materials; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about materials; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F048 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-048 | Tile the bathroom £1,200 plus tiles supplied by the customer | One Tile the bathroom line; price 120000 pence; question about tiles; no area/whole-job total | Capture: 1 line(s), prices [120000]; no question about tiles; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F062 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-062 | Paint two coats at £100 per coat | One Paint two coats line; price 10000 pence; quantity 2; unit coats; no extra question required; never 20000 pence; no area/whole-job total | Capture: 1 line(s), prices [10000], quantities ["2"], units ["coats"]; Reader A: 1 line(s), prices [null], quantities [null], units [null]; Checked Reader A unchanged | P1 | open | — |
| RT-02-F063 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-063 | Lay ten metres of skirting at £25 per metre | One Lay ten metres of skirting line; price 2500 pence; quantity 10; unit m; no extra question required; never 25000 pence; no area/whole-job total | Capture: 1 line(s), prices [null], quantities ["1"], units ["item"]; Reader A: 1 line(s), prices [2500], quantities ["10"], units ["m"]; Checked Reader A unchanged | P1 | open | — |
| RT-02-F064 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-064 | Tile twelve square metres at £30 per square metre | One Tile line; price 3000 pence; quantity 12; unit m²; no extra question required; never 36000 pence; no area/whole-job total | Capture: 1 line(s), prices [null], quantities ["1"], units ["item"]; Reader A: 1 line(s), prices [3000], quantities ["12"], units ["m\u00b2"]; Checked Reader A unchanged | P1 | open | — |
| RT-02-F080 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-080 | Paint the hall at a day rate of £180 for three days | One Paint the hall line; price null pence; question about price; never 54000 pence; no area/whole-job total | Capture: 1 line(s), prices [18000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F081 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-081 | Paint the hall day rate £180, three days | One Paint the hall line; price null pence; question about price; never 54000 pence; no area/whole-job total | Capture: 1 line(s), prices [18000]; no question about price; Reader A: 1 line(s), prices [18000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F084 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-084 | Lay the floor £25 a metre for ten metres | One Lay the floor line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [null]; requested question present; Reader A: 1 line(s), prices [null]; no question about price; Checked Reader A unchanged | P2 | open | — |
| RT-02-F085 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-085 | Tile the floor £25 per square metre for twelve square metres | One Tile the floor line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [null]; requested question present; Reader A: 1 line(s), prices [null]; no question about price; Checked Reader A unchanged | P2 | open | — |
| RT-02-F100 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-100 | Paint the hall for £400 give or take | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F101 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-101 | Paint the hall for give or take £400 | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [40000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F102 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-102 | Paint the hall for call it £400 | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [40000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F105 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-105 | Paint the hall for approx. £400 | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 2 line(s), prices [null, null], descriptions ["Paint the hall for approx", "£400"]; requested question present; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F106 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-106 | Paint the hall for ballpark £400 | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [40000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F107 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-107 | Paint the hall for £400 ballpark | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F109 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-109 | Paint the hall for somewhere near £400 | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [40000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F110 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-110 | Paint the hall for in the region of £400 | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [40000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F111 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-111 | Paint the hall for circa £400 | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [40000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F116 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-116 | Paint the hall for a budget of £500 | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [50000]; no question about price; Reader A: 1 line(s), prices [50000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F117 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-117 | Paint the hall for allow £500 | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [50000]; no question about price; Reader A: 1 line(s), prices [50000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F118 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-118 | Paint the hall for allowance of £500 | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [50000]; no question about price; Reader A: 1 line(s), prices [50000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F119 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-119 | Paint the hall for provisionally £500 | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [50000]; no question about price; Reader A: 1 line(s), prices [50000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F120 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-120 | Paint the hall for £500 subject to survey | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [50000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F121 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-121 | Paint the hall for £500 estimated | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [50000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F122 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-122 | Paint the hall for an estimate of £500 | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [50000]; no question about price; Reader A: 1 line(s), prices [50000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F123 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-123 | Paint the hall for maybe £500 | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [50000]; no question about price; Reader A: 1 line(s), prices [50000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F124 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-124 | Paint the hall for probably £500 | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [50000]; no question about price; Reader A: 1 line(s), prices [50000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F128 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-128 | Paint the hall for £400 if the walls are sound | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F129 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-129 | Paint the hall for £500 unless the plaster needs repair | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [50000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F130 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-130 | Paint the hall for £600 provided access is clear | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 2 line(s), prices [60000, null], descriptions ["Paint the hall for £600 provided access is", "clear"]; no question about price; Reader A: 2 line(s), prices [null, null], descriptions ["Paint the hall for £600 provided access is", "clear"]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F131 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-131 | Paint the hall for £700 subject to seeing the joists | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [70000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F132 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-132 | Paint the hall for £250 depending on the finish | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [25000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F133 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-133 | Paint the hall for £350 assuming no rot | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [35000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F134 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-134 | Paint the hall for £450 only if the room is empty | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [45000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F135 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-135 | Paint the hall for £550 conditional on access | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [55000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F136 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-136 | Paint the hall for £650 if we can reuse the frame | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [65000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F137 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-137 | Paint the hall for £750 if materials arrive on time | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [75000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F138 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-138 | Paint the hall for £400 if paid in advance | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F139 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-139 | Paint the hall for £400 subject to customer approval | One Paint the hall line; price null pence; question about price; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F147 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-147 | Paint the hall for £20 cashback | One Paint the hall line; price null pence; question about price; never 42000, 44000, 36000 pence; no area/whole-job total | Capture: 1 line(s), prices [2000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F149 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-149 | Paint the hall for less 10 percent of £400 | One Paint the hall line; price null pence; question about price; never 42000, 44000, 36000 pence; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [40000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F150 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-150 | Paint the hall for 10% off £400 | One Paint the hall line; price null pence; question about price; never 42000, 44000, 36000 pence; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [40000]; no question about price; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F151 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-151 | Paint the hall for £400 with 10% off | One Paint the hall line; price null pence; question about price; never 42000, 44000, 36000 pence; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F152 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-152 | Paint the hall for £400 less ten percent | One Paint the hall line; price null pence; question about price; never 42000, 44000, 36000 pence; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F153 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-153 | Paint the hall for £400 at a 10 percent discount | One Paint the hall line; price null pence; question about price; never 42000, 44000, 36000 pence; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F154 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-154 | Paint the hall for £400 minus the deposit | One Paint the hall line; price null pence; question about price; never 42000, 44000, 36000 pence; no area/whole-job total | Capture: 1 line(s), prices [40000]; no question about price; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F160 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-160 | Fit the kitchen £4,000, customer has paid a £500 deposit | One Fit the kitchen line; price 400000 pence; question about deposit; never 50000, 350000, 450000 pence; no area/whole-job total | Capture: 1 line(s), prices [null]; requested question present; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F161 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-161 | Customer has paid a £500 deposit, fit the kitchen £4,000 | One fit the kitchen line; price 400000 pence; question about deposit; never 50000, 350000, 450000 pence; no area/whole-job total | Capture: 1 line(s), prices [null]; no question about deposit; Reader A: 1 line(s), prices [400000]; no question about deposit; Checked Reader A unchanged | P1 | open | — |
| RT-02-F162 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-162 | Fit the kitchen £4,000, deposit of £500 already paid | One Fit the kitchen line; price 400000 pence; question about deposit; never 50000, 350000, 450000 pence; no area/whole-job total | Capture: 1 line(s), prices [null]; requested question present; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F163 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-163 | Fit the kitchen £4,000, they have paid £500 already | One Fit the kitchen line; price 400000 pence; question about paid; never 50000, 350000, 450000 pence; no area/whole-job total | Capture: 1 line(s), prices [null]; requested question present; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P1 | open | — |
| RT-02-F164 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-164 | Fit the kitchen, deposit of £500 | One Fit the kitchen line; price null pence; question about deposit; never 50000, 350000, 450000 pence; no area/whole-job total | Capture: 1 line(s), prices [50000]; no question about deposit; Reader A: 1 line(s), prices [50000]; no question about deposit; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F165 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-165 | Fit the kitchen, they have paid £500 already | One Fit the kitchen line; price null pence; question about paid; never 50000, 350000, 450000 pence; no area/whole-job total | Capture: 1 line(s), prices [50000]; no question about paid; Reader A: 1 line(s), prices [null]; requested question present; Checked Reader A unchanged | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RT-02-F166 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-166 | Fit skirting free of charge | One Fit skirting line; price [null, 0] pence; question about free of charge; no area/whole-job total | Capture: 1 line(s), prices [null]; no question about free of charge; Reader A: 1 line(s), prices [null]; no question about free of charge; Checked Reader A unchanged | P2 | open | — |
| RT-02-F167 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-167 | Fit skirting for free | One Fit skirting line; price [null, 0] pence; question about for free; no area/whole-job total | Capture: 1 line(s), prices [null]; no question about for free; Reader A: 1 line(s), prices [null]; no question about for free; Checked Reader A unchanged | P2 | open | — |
| RT-02-F168 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-168 | Fit skirting at no charge | One Fit skirting line; price [null, 0] pence; question about at no charge; no area/whole-job total | Capture: 1 line(s), prices [null]; no question about at no charge; Reader A: 1 line(s), prices [null]; no question about at no charge; Checked Reader A unchanged | P2 | open | — |
| RT-02-F169 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-169 | Fit skirting chuck it in | One Fit skirting line; price [null, 0] pence; question about chuck it in; no area/whole-job total | Capture: 1 line(s), prices [null]; no question about chuck it in; Reader A: 1 line(s), prices [null]; no question about chuck it in; Checked Reader A unchanged | P2 | open | — |
| RT-02-F170 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-170 | Fit skirting on the house | One Fit skirting line; price [null, 0] pence; question about on the house; no area/whole-job total | Capture: 1 line(s), prices [null]; no question about on the house; Reader A: 1 line(s), prices [null]; no question about on the house; Checked Reader A unchanged | P2 | open | — |
| RT-02-F171 | RT-02 | a44f5d35b363a5182b166ff724d2d09ca5c1060f | RT-02-171 | Fit skirting complimentary | One Fit skirting line; price [null, 0] pence; question about complimentary; no area/whole-job total | Capture: 1 line(s), prices [null]; no question about complimentary; Reader A: 1 line(s), prices [null]; no question about complimentary; Checked Reader A unchanged | P2 | open | — |

Validation: built `@jobguard/core` once to provide the existing package dependency; ran
`pnpm --filter @jobguard/ai test --maxWorkers=1` before the repair (508/508), the new corpus before
the repair (12 failures), and the corpus plus unchanged `capture-qualified-price.test.ts` after
(54/54). `pnpm eval --maxWorkers=1` ran all 532 AI tests with one worker: 528 pass, four golden-gate failures.
No whole-repository tests ran. Before/after evaluator reports were compared using the original parser
from Git HEAD through a temporary Node loader and the repaired compiled parser; the reports are identical.
The AI package's `build`, `typecheck` and `lint` pass.

Golden hash note: the parser SHA-256 changes from
`bbdcc67597d8298f6f4dcb6a3ed5dcd59bca44982f51d556558ca2b9cab8aaee` to
`b2f5f2c9a91c25d2a5a2d3f221da9bd9baf49b6e05dc4cf6fa085b19ee614841`.
A full golden-record comparison confirms that this one source hash is the only difference; predictions,
labels, metrics, versions, thresholds and other source hashes are identical. The checked-in golden record
is outside this order's five-file edit scope and is unchanged. Its two direct equality tests and the two
CLI tests that invoke the same verification fail until that record is refreshed and reviewed. This is a
held gate, not a green `pnpm eval` claim. Independent review and merge are not claimed.

Initial review — LATER / SIMPLICITY: `packages/ai/src/context-reader.ts:correction` and `totals` have
older, narrower correction patterns. A future reader change could reuse the shared correction marker
rather than maintain separate vocabularies, reducing grammar drift. Outside this fix's allowed files;
non-blocking.

RT-01 receipt (#1071, 28 Nov 2026): `HEAD_UNDER_TEST=b25b5ee931ff7bb62bbaa34a47099fddadf514ed`.
192 unique fictional transcripts; 83 declared pass and 109 open-finding cases
(8 P0 wrong-money cases, 49 P1 missing/misplaced/split item or exact price cases, 52 P2 safely
unpriced cases without an explicit price question). Each open case has its own row and finding id; these
are failing examples, not a count of independent root causes. Capture and Reader A results above were
observed locally through the unchanged RT-00 runner checks, including a checked Reader A. No parser fix,
model call, audio, preview, deployment, CI or independent-review claim is made.

Expectations were specified from the words before observation. The lane's permitted conservative open
option is used for unsupported digit scripts and mixed/unfinished pence shorthand; an explicit price
question is required, so a generic line-review or disposal prompt does not satisfy these cases. Literal
Unicode spaces and zero-padded amounts retain their exact numeric meaning. Invisible input characters
are named in the table for readability; the corpus keeps their original codepoints. Initial semantic
review tightened RT-01-055: “hundred and fifty pounds” explicitly states 15000 pence despite its omitted
article; this is an expectation correction, not an accommodation of the parser's null output.

Initial source inspection — LATER / SIMPLICITY: `packages/ai/src/context-reader.ts:thousands` and
`packages/ai/src/capture-fixture-parser.ts:amounts`: consider reading exact grand/k tokens in the existing
shared amount reader, with the same whole-token guards. This would reduce duplicate money grammars and
prevent the capture/Reader A price divergence shown by RT-01-065–071. Non-blocking follow-up only.

Validation: `pnpm --filter @jobguard/core build` supplied the missing local package export, then
`pnpm --filter @jobguard/ai test --maxWorkers=1` passed all 28 files / 700 tests (10.98 s).
The unchanged RT-00 runner reports RT-01: 83 pass / 109 open, and RT-00: 2 pass / 3 open.
Open findings are expected failing examples enforced by the runner; a green test suite does not close
them. Only AI package tests ran; no repository-wide, browser, database or paid/live-model suite ran.
The 21 other inherited staged RT-00/plan files were hash-checked byte-for-byte, and the original
`FINDINGS.md` content remains an unchanged prefix. The attack adds only its corpus, lane config and
findings/receipt; the inherited staged files are included by Ben's explicit commit instruction.


## RT-FIX-3 repair receipt (28 Nov 2026, #1071)

Fixed RT-01-F121, F133, F134 and F142–F146. Their original expected values are unchanged; their
corpus statuses now pass. The supplied staged RT-01 corpus and findings are included in this commit. The staged attack copy
had overwritten RT-FIX-2's status/receipt; those existing HEAD records are preserved here.
RT-01-193–268 add 76 regression cases for deduction words, bracket/trailing-minus notation, repeated
points and eleven invisible format/default-ignorable characters before, within and after an amount.
All require one open line and an explicit `Confirm price` question on both readers and the checked reader.

`capture-fixture-parser.ts:saidAmountOpen` retains the single Q77 limit/credit guard: take off, knock
off, deduct, deduction, less, discount, minus the, rebate, refund and back for extend that guard rather
than introducing another deduction check. Brackets and trailing minus signs open the price there too.
Malformed decimal tokens stay whole; both splitters use the same decimal-point positions. Format
characters are rejected, never normalized away. This includes U+FEFF, which ordinary whitespace
trimming and the validator's currency-prefix removal used to discard. Source offsets stay unchanged.

The core number validator also rejects either fragment of a repeated-point amount. Its existing
`read.open` hook still calls the same guard; rejected spoken line prices ask `Confirm price`.
The core edit is needed for reader/model candidates citing just `£150` or `50` in `£150..50`, and
for digit-only citations immediately after `£` plus U+FEFF. No duplicated money/deduction guard was added.

Initial source inspection — LATER / SIMPLICITY: `packages/ai/src/context-reader.ts:priceNear` and
`capture-fixture-parser.ts:amounts`: consider reusing one token enumeration for line and total amounts,
retaining the context reader's bare-number/thousands support. This would reduce future differences in
partial-token handling. Non-blocking follow-up; this repair keeps their existing contracts.

Executed validation (one Vitest worker; no repository-wide, DB, browser or paid/live-model tests):

- Baseline: `pnpm --filter @jobguard/ai test --maxWorkers=1`: 28 files / 724 tests pass;
  RT-01 83 pass / 109 open, RT-00 3 pass / 2 open, RT-03 24 pass / 0 open.
- Targeted: `pnpm --filter @jobguard/ai test --maxWorkers=1 src/redteam/corpus.test.ts src/capture-qualified-price.test.ts`:
  2 files / 322 tests pass. Q77's test file is unchanged.
- Final `pnpm --filter @jobguard/ai test --maxWorkers=1` and `pnpm eval --maxWorkers=1`:
  both pass 28 files / 800 tests; RT-01 167 pass / 101 open;
  other lane counts unchanged. Open findings remain enforced failing examples, not resolved findings.
- Required local dependency compilation: `pnpm --filter @jobguard/core build`; AI compilation:
  `pnpm --filter @jobguard/ai build`; both pass. No source test files or evaluation floors changed.
- Direct compiled-AI adversarial matrix (`node /tmp/jobguard-rt-fix-3-check.mjs`): all 84 repaired/new
  inputs retain untouched capture descriptions, reject 194 unsafe positive line-price candidates
  (including digit-only citations) with `Confirm price`, and reject 194 unsafe room/whole-job candidates.
  Both readers' total paths also keep all 84 variants open. This is an executed deterministic check,
  not an independent review.
- Regenerated `golden-run.v1.json` through `runCaptureEvaluation` / `createGoldenRunRecord`:
  only the capture parser implementation hash changes; all 32 predictions are identical. Before/after:
  scope recall 41/41, valid citations 119/119, unsupported monetary facts 0, ambiguity checks 63/63.

The lane policy loads successfully and its boundary check covers exactly the seven authorized files.
`git diff --check` passes. The package manager's generated cache was preserved under `/tmp`, outside
the worktree.

Parser/validator repair only: no database migration, provider action, web workflow or commercial-policy
change. No push, merge, deployment, independent review, acceptance or production readiness is claimed.


### RT-FIX-3 review repair round 1 (#1077, 28 Nov 2026)

Work recognition ignores leading and inner invisible format characters in a temporary comparison
copy. The source and work-description spans retain them. Leading characters before a work verb do
not open an otherwise intact price; characters inside or beside an amount still do. The title span
now accounts for a trimmed BOM. No parser or policy version changes.

Added RT-01-269–271 for the requested BOM/zero-width prefixes, each retaining two lines priced
15000 and 20000 pence, and RT-01-272 for invisible characters inside both work verbs. The three
requested cases fail before the repair and pass afterward through capture, Reader A and its numeric
checker, including source-span invariants.

Executed locally with at most two Vitest workers:
- `pnpm --filter @jobguard/ai test --maxWorkers=2`: 28 files / 804 tests pass.
- `pnpm eval --maxWorkers=2`: 28 files / 804 tests pass.
- `pnpm --filter @jobguard/ai typecheck`, `lint` and `build`: pass.
- Golden record: only the parser implementation SHA-256 changed; all 32 fixture predictions and
  evaluation totals remain unchanged (recall 41/41, citations 119/119, unsupported money 0,
  ambiguities 63/63). Existing open findings remain open.

Deterministic local verification only. No push, merge, release or independent review claimed.

### RT-FIX-3 review repair round 2, final allowed (#1077, 28 Nov 2026)

Fixed the single-item start comparison: the prefix before the original chunk must contain only
whitespace/format/default-ignorable characters. It no longer compares a preserved chunk offset
against `trimStart()`'s BOM-stripped offset. Recognition copies are shared for clause starts,
timing, titles, room checks and work/trade checks; offset-bearing matches stay on the original
text with the original leading-prefix length. Source-facing trimming preserves BOMs consistently
in titles, cells, fallbacks and total-price tokens. No source text is normalized for citations or
amount parsing, and no parser/policy version changes.

The amount guard ignores a leading invisible prefix only when actual clause text follows it,
including a title/room before work. The numeric checker can supply that whole clause for late work;
a BOM before the title must not clear the later intact price. A format character directly beside
or inside an amount, or inside the clause, still opens the price. Existing deduction, bracket,
trailing-minus and malformed-amount checks remain enforced.

Added RT-01-273–302: no-prefix controls plus BOM, zero-width space, non-joiner, joiner and word-joiner
variants for the requested single item, title, room-led and two-item notes, plus a late-work title.
The corpus checks both parsers and the checked reader, including line counts and original-source
span invariants. No existing expectations or open-finding statuses were weakened.

Parity means each reader keeps its no-invisible behavior: the single item is 15000 pence on all
paths and the two items are 15000/20000. Capture retains its existing unpriced fallback for the
single title/room-led notes; Reader A retains 20000/90000. Those differing baselines are unchanged.
A compiled-AI matrix also explicitly compares line descriptions, prices, quantities, units, titles,
rooms and trades against each path's control, including a mixed whitespace/invisible prefix.
It passed 35 inputs, 105 path comparisons and 301 citation checks. Its checker excludes Reader A's
internal timeline before revalidating the public understanding contract.

Executed final validation with at most two Vitest workers:
- `pnpm --filter @jobguard/ai test --maxWorkers=2`: 28 files / 834 tests pass.
- `pnpm eval --maxWorkers=2`: 28 files / 834 tests pass.
- `pnpm --filter @jobguard/ai typecheck`, `lint` and `build`: pass.
- `node /tmp/rt-fix-3-round2-parity.mjs`: passes the matrix described above.
- Regenerated the golden record through `runCaptureEvaluation` / `createGoldenRunRecord`:
  only the parser implementation SHA-256 changes. All 32 predictions and totals are unchanged:
  recall 41/41, citations 119/119, unsupported money 0, ambiguity checks 63/63.
- Corpus: RT-01 201 pass / 101 open; RT-00 and RT-03 unchanged. Existing open findings remain open.
- `git diff --check`: pass. Generated pnpm cache preserved under `/tmp`, outside the worktree.

Deterministic local verification only. Five requested files changed; no database, web, provider,
commercial-policy or release change. Commit only; no push, merge, acceptance or independent review
claimed. This exhausts the two allowed review-repair rounds for this piece.

### RT-02 qualifier attack (#1071, 28 Nov 2026)

HEAD_UNDER_TEST (branch base): `a44f5d35b363a5182b166ff724d2d09ca5c1060f`.
Used the newer `lanes-ref` README invariants/corpus contract and RT-02 lane instructions.
175 distinct synthetic transcripts: **82 pass / 93 open** (42 P0, 38 P1, 13 P2).
Each failing case has its own open finding row above, bound to that base SHA.
Expectations follow the spoken scope and qualifications: no discount/rate arithmetic, no deposit
as a price, VAT/materials questions, matching counted units, and a question for free work.

Open P0 IDs (all prefixed `RT-02-F`): **026–027, 080–081, 100–102, 106–107,
109–111, 116–124, 128–139, 147, 149–154, 164–165**.
These cover percentage deductions, time rates kept as line prices, hedges/budgets, conditions,
cashback, and deposits/prior payments promoted to charges. Full transcripts and path-specific
actual results are in the table. P1 includes lost prices/counts and extra work lines; P2 includes
missing VAT, rate and free-work questions. None is treated as a fix or an accepted release risk.

Executed locally with Node 24.17.0 and the pinned pnpm 10.28.1:

- Dependency compilation: `pnpm --filter @jobguard/core build` passes.
- Before: `pnpm --filter @jobguard/ai test --maxWorkers=2` passes 28 files / 875 tests.
- After: the same command passes 28 files / 1,050 tests. Existing lane counts unchanged:
  RT-00 3 pass / 2 open; RT-01 201 pass / 101 open; RT-03 24 pass / 0 open.
  The existing runner exercises capture, Reader A and checked Reader A, including M1/S2/S4.
  Every open case must still fail its oracle; green Vitest does not mean these defects are fixed.
- `pnpm --filter @jobguard/ai typecheck`, `lint` and `build` pass.
- Lane policy loads and all three changed files pass `lanePathAllowed`, including the lane config
  through the checker's automatic own-file permission (explicit register grants are forbidden).
- Verified 175 unique transcripts, exactly one row per open case, correct head bindings, and no
  changes to earlier findings, production source, Q77, existing test expectations or golden records.
- `git diff --check` passes. Generated package-manager cache is excluded from the commit.

Deterministic local attack evidence only. No paid API, audio upload, migration, browser/DB change,
push, deployment, merge or independent review. Commit only, as requested.

## RV-1 money review (RT-FIX-5)

RV corpus uses lane RT-01 because the existing runner accepts RT-nn only. RV1-19/20 transcript regressions are supplemented by the exact constructed-understanding probes below.

| ID | Lane | Head sha | Case id | Transcript | Expected | Actual | Sev | Status | Fix PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RV1-01 | RV-1 | a44f5d35 | RV1-01 | `Paint the walls for zero thousand pounds` | £0 or leave open; never £1,000. | F and C keep **£1,000**. | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-02 | RV-1 | a44f5d35 | RV1-02 | `Paint the walls. All in £2m.` | Leave unsupported amount open; never truncate to £2. | C keeps whole-job **£2**. | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-03 | RV-1 | a44f5d35 | RV1-03 | `Paint the walls. All in £200½.` | £200.50 or leave open. | C keeps whole-job **£200**. | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-04 | RV-1 | a44f5d35 | RV1-04 | `Paint the walls for no greater than £200` | Leave ceiling open. | F and C keep **£200** as a line price. | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-05 | RV-1 | a44f5d35 | RV1-05 | `Paint the walls for maybe £200` | Leave hedged price open. | F and C keep **£200**. | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-06 | RV-1 | a44f5d35 | RV1-06 | `Paint the walls for a discount of £200` | Leave discount open; never make it a positive charge. | F and C keep **+£200**. | P0 | already fixed on RT-FIX-2/3 baseline | RT-FIX-2/3 / #1071 |
| RV1-07 | RV-1 | a44f5d35 | RV1-07-1, RV1-07-2, RV1-07-3, RV1-07-4 | `Paint the walls for £200 plus materials`<br>`Paint the walls for £200 if dry`<br>`Paint the walls for £200/day`<br>`Paint the walls for £200 percent` | Leave each qualified amount open. M2 override: explicit VAT/materials and bare plus retain the amount and ask. | F keeps **£200** in every case. C clears these four. | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-08 | RV-1 | a44f5d35 | RV1-08-1, RV1-08-2, RV1-08-3 | `Paint the walls for £200, plus materials`<br>`Paint the walls for £200, if dry`<br>`Paint the walls for £200, per day` | Leave qualified amount open. M2 override: explicit VAT/materials and bare plus retain the amount and ask. | C keeps **£200**, with `priceBasis: "line"`, in all three. The comma bypasses the qualifier handling. | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-09 | RV-1 | a44f5d35 | RV1-09-1, RV1-09-2, RV1-09-3 | `Paint the walls. All in £200 plus materials.`<br>`Paint the walls. All in £200 if dry.`<br>`Paint the walls. All in £200/day.` | Leave qualified total open. M2 override: explicit VAT/materials and bare plus retain the amount and ask. | C keeps whole-job **£200** in all three. | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-10 | RV-1 | a44f5d35 | RV1-10 | `Paint the walls. All in €200.` | Reject non-GBP price. | C keeps whole-job **£200**; the citation contains only `200`. | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-11 | RV-1 | a44f5d35 | RV1-11 | `Paint the walls. All in 200%.` | Leave percentage open; never treat it as pounds. | C keeps whole-job **£200**. | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-12 | RV-1 | a44f5d35 | RV1-12 | `Paint the walls. All in £200—six hundred.` | Leave range open. | C keeps whole-job **£200**. The separator is an em dash, U+2014. | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-13 | RV-1 | a44f5d35 | RV1-13 | `Paint the walls for £200 plus` | Leave incomplete addition open. M2 override: explicit VAT/materials and bare plus retain the amount and ask. | F and C keep **£200**. C treats bare `plus` as an acceptable VAT tail, then adds no VAT question. | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-14 | RV-1 | a44f5d35 | RV1-14 | `Paint the walls. All in £200, actually £300.` | Leave corrected total open. | C retains the superseded whole-job **£200**. | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-15 | RV-1 | a44f5d35 | RV1-15 | `Paint the walls. All in £200 plus VAT.` | Leave VAT-qualified total open under RV-1. M2 override: explicit VAT/materials and bare plus retain the amount and ask. | C keeps whole-job **£200**, with **no VAT question**. | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-16 | RV-1 | a44f5d35 | RV1-16 | `Paint the walls for £200. Actually £300.` | One work item; corrected price left open and queried. | F and C produce **two priced items**: `Paint the walls` at **£200**, and `Actually` at **£300**. | P1 | already fixed on RT-FIX-2/3 baseline | RT-FIX-2/3 / #1071 |
| RV1-17 | RV-1 | a44f5d35 | RV1-17 | Exact JS string: `"Paint the walls. " + "all in ".repeat(4000) + "£200"` | Finish within 1 second or reject promptly. | A 28,021-character input took **3.748 s**, **3.489 s**, and **3.607 s** across three runs. | P1 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-18 | RV-1 | a44f5d35 | RV1-18 | `Paint the walls for £200 plus VAT` | M2: retain £200 and ask about VAT. | F and C retain **£200**, but explicitly ask to confirm VAT and state that VAT was neither added nor removed. This is deliberate existing behaviour and preserves the said number. | P2 | covered by existing M2 behavior | existing behavior |
| RV1-19 | RV-1 | a44f5d35 | RV1-19 | checkSpokenNumbers(base, "Paint the walls for £200 per day") | Core supplied understanding: clear an unsupported daily rate | 20000 survives with line basis | P0 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |
| RV1-20 | RV-1 | a44f5d35 | RV1-20 | base from "Paint the walls for £200"; 200 Check access. questions; line price value 20001; checkSpokenNumbers(input, source) | Core supplied understanding: clear mismatched price with 200 questions and return a valid schema | Question 201 throws ZodError | P1 | fixed (deterministic local tests) | RT-FIX-5 / #1071 (commit only) |

### RT-FIX-5 verification receipt (28 November 2026)

- Base: `a44f5d35`; requested `git merge --no-edit origin/codex/sandbox/rt-02` fast-forwarded to `d7a174a0`. No rebase. Working branch: `codex/sandbox/rt-fix-5`.
- Initial review, **LATER / SIMPLICITY**: `capture-fixture-parser.ts` and `context-reader.ts` each retain their existing unit/plural comparison. Reusing one comparison in a future bounded change would reduce drift between rates and counted units. Non-blocking; no unrelated refactor here.
- One shared safety guard (`saidAmountOpen`) retains the qualifier lists and is called by draft lines, Reader A lines, totals and the core number checker callback. The redundant total-only uncertainty guard and line-only approximation check were removed; their existing words remain in the shared guard. Unit context crosses the existing callback; no dependency from core to AI was added.
- M2 overrides RV-1's original request to drop explicit VAT/materials amounts: plus VAT, inc VAT, plus materials, labour only and bare plus retain the said amount and ask, including comma forms and totals. Conditions, ceilings, estimates, percentages, discounts, payments already made, non-GBP currency and unsupported numeric suffixes stay open. Zero thousand reads exactly zero.
- RV-1 corpus: 27 transcript cases covering every one of the 18 table rows and the source transcripts of the two constructed core inputs, plus 162 qualifier/M2 matrix cases. The existing runner accepts RT-nn lanes only, so corpus lane RT-01 is intentional; finding rows use RV-1. Existing runner and all earlier expectations are unchanged.
- Before repair, the added corpus ran under the existing Vitest runner. RV1-06 (discount) and RV1-16 (sentence correction) already passed from RT-FIX-2/3. RV1-18 already satisfied the explicit M2 VAT rule. The timing and two constructed core rows have transcript outputs that already pass; their actual performance/supplied-understanding assertions were separately reproduced against isolated, transpiled `d7a174a0` source: daily rate retained 20000; cap case threw ZodError; timing 6262 / 3935 / 4211 ms. Source isolation was under `/tmp`; repository source was not swapped.
- After repair, RV1-01–20 are covered with no open RV-1 finding. Previously fixed RV1-06/16 and existing M2 RV1-18 remain explicitly identified above. Timing is 43 / 35 / 34 ms across three runs, all below 1 s. The transcript corpus does not itself assert elapsed time or supply custom understanding objects; these are separate executed probes, not claims about the runner's schema.

RT-02 retains its expectations byte-for-byte; only 45 `status` values changed. Original passing cases have no reported severity, so they are listed separately rather than assigned an invented severity.

| Reported severity | Before pass | Before open | After pass | After open |
| --- | ---: | ---: | ---: | ---: |
| P0 | 0 | 42 | 42 | 0 |
| P1 | 0 | 38 | 3 | 35 |
| P2 | 0 | 13 | 0 | 13 |
| Original passing cases (ungraded) | 82 | 0 | 82 | 0 |
| Total | 82 | 93 | 127 | 48 |

The P1 improvements are RT-02-F029/030 (M2 materials/labour qualifier handling) and F105 (approx. punctuation). F130's conditional “clear” stays on its one work item. Remaining RT-02 P1/P2 findings are unchanged and remain open.

Commands and deterministic results:

- Before: `pnpm --filter @jobguard/core build`; `pnpm eval --maxWorkers=2`: 28 files / 1,050 tests pass. An initial attempt before dependency compilation could not resolve core's dist entry; rerunning after compilation established the baseline. No install or dependency change was needed.
- After: `pnpm eval --maxWorkers=2`: 28 files / 1,239 tests pass (189 added corpus cases). This includes every existing corpus and unchanged `capture-qualified-price.test.ts`.
- `pnpm --filter @jobguard/core test --maxWorkers=2`: 232 files / 4,895 tests pass. No core tests were added or changed; this is the after count, not an unexecuted baseline claim.
- Golden evaluation before and after: 32/32 cases; scope recall 41/41; valid citations 119/119; unsupported monetary facts 0; ambiguity checks 63/63. No score drop. The checked-in golden record changes only the parser implementation SHA-256; labels, targets, scores and outputs are unchanged.
- `pnpm --filter @jobguard/core --filter @jobguard/ai typecheck`, `lint`, and `build` pass. Test workers capped at two per invocation.
- Separate Node assertion probes (34 assertions) pass: the exact supplied-understanding rate and 200-question inputs from RV-1; daily/hourly/slash/comma rate variants; a full array with an existing line question; schema validity after clearing; three elapsed-time assertions; golden score equality. Reproduction of the two constructed inputs:

```js
const source = "Paint the walls for £200";
const { timeline, ...base } = readSpokenJob("rv1", source);
const rate = checkSpokenNumbers(base, "Paint the walls for £200 per day");
// rate.lines[0].unitPricePence.value === null; priceBasis === "none"
const input = {
  ...base,
  questions: Array.from({ length: 200 }, () => ({ text: "Check access." })),
  lines: base.lines.map(line => ({
    ...line, unitPricePence: { ...line.unitPricePence, value: 20001 }
  }))
};
const checked = checkSpokenNumbers(input, source);
// checked.lines[0].unitPricePence.value === null; questions.length === 200
// jobUnderstandingV1.safeParse(checked).success === true
```

These are deterministic synthetic parser/validator checks, not a live-model evaluation, independent RED review, production approval or end-to-end browser acceptance. No DB, network provider, migration, web workflow or commercial policy changed. Independent review against the exact final head remains required before merge. Commit only; no push or release. `.pnpm-store/` is excluded.
