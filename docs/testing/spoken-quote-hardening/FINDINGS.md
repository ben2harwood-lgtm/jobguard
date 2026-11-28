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
| RT12-01 | RT-12 | b25b5ee9 | 01-four-items (desktop, mobile-360); line-4-trade | strip out the old kitchen fit six base units hang the new doors paint the walls | Decorating | Other | P1 | open-finding | — |
| RT12-02 | RT-12 | b25b5ee9 | 02-two-prices-open (desktop, mobile-360); line-3-trade | strip out the old kitchen for two hundred pounds fit the new units for six hundred pounds paint the walls | Decorating | Other | P1 | open-finding | — |
| RT12-03 | RT-12 | b25b5ee9 | 03-two-sixty (desktop, mobile-360); line-1-trade | paint the walls two hundred pounds and fit the door sixty pounds | Decorating | Other | P1 | open-finding | — |
| RT12-04 | RT-12 | b25b5ee9 | 05-whole-job (desktop, mobile-360); line-3-trade | strip out the old kitchen fit the new units paint the walls eight hundred pounds for the whole job | Decorating | Other | P1 | open-finding | — |
| RT12-05 | RT-12 | b25b5ee9 | 07-thousand (desktop, mobile-360); line-1-trade | Paint the walls for one thousand two hundred and fifty pounds. | Decorating | Other | P1 | open-finding | — |
| RT12-06 | RT-12 | b25b5ee9 | 08-vat (desktop, mobile-360); line-1-trade | Paint the walls for £400 plus VAT. | Decorating | Other | P1 | open-finding | — |
| RT12-07 | RT-12 | b25b5ee9 | 08-vat (desktop, mobile-360); line-1-price | Paint the walls for £400 plus VAT. | (open / blank) | 400.00 | P1 | open-finding; left open is safe but the rule is keep the number as said and ask a question (RT-02 seed table, vatWords) | — |
| RT12-08 | RT-12 | b25b5ee9 | 08-vat (desktop, mobile-360); room-total-Whole job | Paint the walls for £400 plus VAT. | £0.00 · incomplete: 1 row needs a price | £400.00 | P1 | open-finding; left open is safe but the rule is keep the number as said and ask a question (RT-02 seed table, vatWords) | — |
| RT12-09 | RT-12 | b25b5ee9 | 08-vat (desktop, mobile-360); running-total | Paint the walls for £400 plus VAT. | Total so far £0.00 · incomplete: 1 row needs a price | Total so far £400.00 · complete | P1 | open-finding; left open is safe but the rule is keep the number as said and ask a question (RT-02 seed table, vatWords) | — |
| RT12-10 | RT-12 | b25b5ee9 | 09-materials (desktop, mobile-360); line-1-price | Fit the door for £200 plus materials. | (open / blank) | 200.00 | P1 | open-finding; left open is safe but the rule is keep the number as said and ask a question (RT-02 seed table, vatWords) | — |
| RT12-11 | RT-12 | b25b5ee9 | 09-materials (desktop, mobile-360); question-1 | Fit the door for £200 plus materials. | materials | ["Confirm disposal and waste allowance"] | P2 | open-finding | — |
| RT12-12 | RT-12 | b25b5ee9 | 09-materials (desktop, mobile-360); room-total-Whole job | Fit the door for £200 plus materials. | £0.00 · incomplete: 1 row needs a price | £200.00 | P1 | open-finding; left open is safe but the rule is keep the number as said and ask a question (RT-02 seed table, vatWords) | — |
| RT12-13 | RT-12 | b25b5ee9 | 09-materials (desktop, mobile-360); running-total | Fit the door for £200 plus materials. | Total so far £0.00 · incomplete: 1 row needs a price | Total so far £200.00 · complete | P1 | open-finding; left open is safe but the rule is keep the number as said and ask a question (RT-02 seed table, vatWords) | — |
| RT12-14 | RT-12 | b25b5ee9 | 10-correction (desktop, mobile-360); line-count | Paint the walls for £400, no, make that £450. | 1 | 2 | P1 | open-finding | — |
| RT12-15 | RT-12 | b25b5ee9 | 10-correction (desktop, mobile-360); line-1-trade | Paint the walls for £400, no, make that £450. | Decorating | Other | P1 | open-finding | — |
| RT12-16 | RT-12 | b25b5ee9 | 10-correction (desktop, mobile-360); line-1-price | Paint the walls for £400, no, make that £450. | ["", "450.00"] | 400.00 | P0 | duplicate of RT-00-F002 | RT-FIX-2 (fixed; preview not rerun) |
| RT12-17 | RT-12 | b25b5ee9 | 10-correction (desktop, mobile-360); question-1 | Paint the walls for £400, no, make that £450. | 400.*450 | ["Confirm disposal and waste allowance"] | P2 | open-finding | — |
| RT12-18 | RT-12 | b25b5ee9 | 10-correction (desktop, mobile-360); room-total-Whole job | Paint the walls for £400, no, make that £450. | £0.00 · incomplete: 1 row needs a price | £850.00 | P0 | duplicate of RT-00-F002 | RT-FIX-2 (fixed; preview not rerun) |
| RT12-19 | RT-12 | b25b5ee9 | 10-correction (desktop, mobile-360); running-total | Paint the walls for £400, no, make that £450. | Total so far £0.00 · incomplete: 1 row needs a price | Total so far £850.00 · complete | P0 | duplicate of RT-00-F002 | RT-FIX-2 (fixed; preview not rerun) |
| RT12-20 | RT-12 | b25b5ee9 | 11-room-return (desktop, mobile-360); line-count | In the kitchen. Fit the units for £600. In the bathroom. Tile the floor for £200. Back in the kitchen. Paint the walls for £150. | 3 | 4 | P1 | open-finding | — |
| RT12-21 | RT-12 | b25b5ee9 | 11-room-return (desktop, mobile-360); line-2-trade | In the kitchen. Fit the units for £600. In the bathroom. Tile the floor for £200. Back in the kitchen. Paint the walls for £150. | Tiling | Other | P1 | open-finding | — |
| RT12-22 | RT-12 | b25b5ee9 | 11-room-return (desktop, mobile-360); line-3-trade | In the kitchen. Fit the units for £600. In the bathroom. Tile the floor for £200. Back in the kitchen. Paint the walls for £150. | Decorating | Other | P1 | open-finding | — |
| RT12-23 | RT-12 | b25b5ee9 | 11-room-return (desktop, mobile-360); room-total-Kitchen | In the kitchen. Fit the units for £600. In the bathroom. Tile the floor for £200. Back in the kitchen. Paint the walls for £150. | £750.00 | £750.00 · incomplete: 1 row needs a price | P2 | open-finding | — |
| RT12-24 | RT-12 | b25b5ee9 | 11-room-return (desktop, mobile-360); running-total | In the kitchen. Fit the units for £600. In the bathroom. Tile the floor for £200. Back in the kitchen. Paint the walls for £150. | Total so far £950.00 · complete | Total so far £950.00 · incomplete: 1 row needs a price | P2 | open-finding | — |
| RT12-25 | RT-12 | b25b5ee9 | 12-bedroom-two (desktop, mobile-360); line-1-trade | Bedroom two. Paint the walls for £500. | Decorating | Other | P1 | open-finding | — |
| RT12-26 | RT-12 | b25b5ee9 | 12-bedroom-two (desktop, mobile-360); line-1-quantity | Bedroom two. Paint the walls for £500. | 1 | (open / blank) | P2 | open-finding | — |
| RT12-27 | RT-12 | b25b5ee9 | 12-bedroom-two (desktop, mobile-360); line-1-unit | Bedroom two. Paint the walls for £500. | item | (open / blank) | P2 | open-finding | — |
| RT12-28 | RT-12 | b25b5ee9 | 12-bedroom-two (desktop, mobile-360); line-1-price | Bedroom two. Paint the walls for £500. | 500.00 | (open / blank) | P1 | open-finding | — |
| RT12-29 | RT-12 | b25b5ee9 | 12-bedroom-two (desktop, mobile-360); unexpected-questions | Bedroom two. Paint the walls for £500. | [] | ["Check this line. Use Split to make separate work items, then edit and accept each one."] | P2 | open-finding | — |
| RT12-30 | RT-12 | b25b5ee9 | 12-bedroom-two (desktop, mobile-360); room-total-Bedroom 2 | Bedroom two. Paint the walls for £500. | £500.00 | £0.00 · incomplete: 1 row needs a price | P1 | open-finding | — |
| RT12-31 | RT-12 | b25b5ee9 | 12-bedroom-two (desktop, mobile-360); running-total | Bedroom two. Paint the walls for £500. | Total so far £500.00 · complete | Total so far £0.00 · incomplete: 1 row needs a price | P1 | open-finding | — |
| RT12-32 | RT-12 | b25b5ee9 | 14-range (desktop, mobile-360); line-1-trade | Paint the walls for between £300 and £400. | Decorating | Other | P1 | open-finding | — |
| RT12-33 | RT-12 | b25b5ee9 | 15-total-mismatch (desktop, mobile-360); line-1-trade | Paint the walls for £200 and fit the door for £60. £300 for the whole job. | Decorating | Other | P1 | open-finding | — |
| RT12-34 | RT-12 | b25b5ee9 | 15-total-mismatch (desktop, mobile-360); question-2 | Paint the walls for £200 and fit the door for £60. £300 for the whole job. | (?:differ&#124;match&#124;260&#124;add up) | ["Confirm disposal and waste allowance", "You said “£300 for the whole job”. Add a price to each line, or put it on one line."] | P2 | open-finding | — |
| RT12-35 | RT-12 | b25b5ee9 | 16-euro (desktop, mobile-360); line-1-quantity | Fit the door for 200 euros. | 1 | (open / blank) | P2 | open-finding | — |
| RT12-36 | RT-12 | b25b5ee9 | 16-euro (desktop, mobile-360); line-1-unit | Fit the door for 200 euros. | item | (open / blank) | P2 | open-finding | — |
| RT12-37 | RT-12 | b25b5ee9 | 16-euro (desktop, mobile-360); question-1 | Fit the door for 200 euros. | euros | ["Check this line. Use Split to make separate work items, then edit and accept each one."] | P2 | open-finding | — |
| RT12-38 | RT-12 | b25b5ee9 | 16-euro (desktop, mobile-360); unexpected-questions | Fit the door for 200 euros. | [] | ["Check this line. Use Split to make separate work items, then edit and accept each one."] | P2 | open-finding | — |
| RT12-39 | RT-12 | b25b5ee9 | 17-html (desktop, mobile-360); line-1-trade | Paint the walls for £200 and fit the door marked &lt;img src=x onerror=alert(1)&gt; for £60. | Decorating | Other | P1 | open-finding | — |
| RT12-40 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-1-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-41 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-2-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-42 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-3-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-43 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-4-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-44 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-5-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-45 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-6-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-46 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-7-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-47 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-8-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-48 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-9-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-49 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-10-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-50 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-11-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-51 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-12-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-52 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-13-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-53 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-14-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-54 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-15-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-55 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-16-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-56 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-17-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-57 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-18-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-58 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-19-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-59 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-20-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-60 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-21-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-61 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-22-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-62 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-23-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-63 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-24-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-64 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-25-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-65 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-26-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-66 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-27-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-67 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-28-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-68 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-29-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-69 | RT-12 | b25b5ee9 | 18-thirty-items (desktop, mobile-360); line-30-trade | paint panel alpha for ten pounds and paint panel bravo for ten pounds and paint panel charlie for ten pounds and paint panel delta for ten pounds and paint panel echo for ten pounds and paint panel foxtrot for ten pounds and paint panel golf for ten pounds and paint panel hotel for ten pounds and paint panel india for ten pounds and paint panel juliet for ten pounds and paint panel kilo for ten pounds and paint panel lima for ten pounds and paint panel mango for ten pounds and paint panel november for ten pounds and paint panel oscar for ten pounds and paint panel papa for ten pounds and paint panel quebec for ten pounds and paint panel romeo for ten pounds and paint panel sierra for ten pounds and paint panel tango for ten pounds and paint panel uniform for ten pounds and paint panel victor for ten pounds and paint panel whiskey for ten pounds and paint panel xray for ten pounds and paint panel yankee for ten pounds and paint panel zulu for ten pounds and paint panel amber for ten pounds and paint panel birch for ten pounds and paint panel cedar for ten pounds and paint panel dune for ten pounds | Decorating | Other | P1 | open-finding | — |
| RT12-70 | RT-12 | b25b5ee9 | 19-trade-slang (desktop, mobile-360); line-count | In the lounge. Skim the walls for two hundred quid and box in the pipes for one hundred quid and fit the skirting for fifty quid. | 3 | 2 | P1 | open-finding | — |
| RT12-71 | RT-12 | b25b5ee9 | 19-trade-slang (desktop, mobile-360); line-1-price | In the lounge. Skim the walls for two hundred quid and box in the pipes for one hundred quid and fit the skirting for fifty quid. | 200.00 | (open / blank) | P1 | open-finding | — |
| RT12-72 | RT-12 | b25b5ee9 | 19-trade-slang (desktop, mobile-360); line-2-separate | In the lounge. Skim the walls for two hundred quid and box in the pipes for one hundred quid and fit the skirting for fifty quid. | false | true | P1 | open-finding | — |
| RT12-73 | RT-12 | b25b5ee9 | 19-trade-slang (desktop, mobile-360); line-2-trade | In the lounge. Skim the walls for two hundred quid and box in the pipes for one hundred quid and fit the skirting for fifty quid. | Carpentry | Plastering | P1 | open-finding | — |
| RT12-74 | RT-12 | b25b5ee9 | 19-trade-slang (desktop, mobile-360); line-2-price | In the lounge. Skim the walls for two hundred quid and box in the pipes for one hundred quid and fit the skirting for fifty quid. | 100.00 | (open / blank) | P1 | open-finding | — |
| RT12-75 | RT-12 | b25b5ee9 | 19-trade-slang (desktop, mobile-360); unexpected-questions | In the lounge. Skim the walls for two hundred quid and box in the pipes for one hundred quid and fit the skirting for fifty quid. | [] | ["Confirm price: Skim the walls for two hundred quid and box in the pipes for one hundred quid"] | P2 | open-finding | — |
| RT12-76 | RT-12 | b25b5ee9 | 19-trade-slang (desktop, mobile-360); room-total-Lounge | In the lounge. Skim the walls for two hundred quid and box in the pipes for one hundred quid and fit the skirting for fifty quid. | £350.00 | £50.00 · incomplete: 1 row needs a price | P1 | open-finding | — |
| RT12-77 | RT-12 | b25b5ee9 | 19-trade-slang (desktop, mobile-360); running-total | In the lounge. Skim the walls for two hundred quid and box in the pipes for one hundred quid and fit the skirting for fifty quid. | Total so far £350.00 · complete | Total so far £50.00 · incomplete: 1 row needs a price | P1 | open-finding | — |
| RT12-78 | RT-12 | b25b5ee9 | 20-room-price (desktop, mobile-360); line-count | In the bathroom. Tile the floor and fit the basin. £800 for the bathroom. | 2 | 3 | P1 | open-finding | — |
| RT12-79 | RT-12 | b25b5ee9 | 20-room-price (desktop, mobile-360); line-1-trade | In the bathroom. Tile the floor and fit the basin. £800 for the bathroom. | Tiling | Other | P1 | open-finding | — |
| RT12-80 | RT-12 | b25b5ee9 | 20-room-price (desktop, mobile-360); question-1 | In the bathroom. Tile the floor and fit the basin. £800 for the bathroom. | 800.*bathroom | ["Confirm disposal and waste allowance"] | P2 | open-finding | — |
| RT12-81 | RT-12 | b25b5ee9 | 20-room-price (desktop, mobile-360); room-total-Bathroom | In the bathroom. Tile the floor and fit the basin. £800 for the bathroom. | £0.00 · incomplete: 2 rows need a price | £800.00 · incomplete: 2 rows need a price | P1 | open-finding; price missing, not wrong | — |
| RT12-82 | RT-12 | b25b5ee9 | 20-room-price (desktop, mobile-360); running-total | In the bathroom. Tile the floor and fit the basin. £800 for the bathroom. | Total so far £0.00 · incomplete: 2 rows need a price | Total so far £800.00 · incomplete: 2 rows need a price | P1 | open-finding; price missing, not wrong | — |
| RT12-83 | RT-12 | b25b5ee9 | 20-room-price (desktop, mobile-360); said-room-price | In the bathroom. Tile the floor and fit the basin. £800 for the bathroom. | true | false | P2 | open-finding | — |

| RT12-84 | RT-12 | b25b5ee9 | 01–20 @layout-save (mobile-360); tap-targets | All 20 fictional scripts from RT-12-right-place.spec.ts; representative: strip out the old kitchen fit six base units hang the new doors paint the walls | Every measured review control at least 44×44 px | 20/20 scripts fail; representative Walk the job 85.56×36, price field 272×42, Save review 100.72×40; per-script counts below | P2 | open-finding | — |
| RT12-85 | RT-12 | b25b5ee9 | 01–20 @layout-save (desktop); tap-targets | All 20 fictional scripts from RT-12-right-place.spec.ts; representative: strip out the old kitchen fit six base units hang the new doors paint the walls | Every measured review control at least 44×44 px | 20/20 scripts fail; representative Walk the job 85.56×36, price field 138×42, Save review 100.72×40; per-script counts below | P2 | open-finding | — |
| RT12-86 | RT-12 | b25b5ee9 | 01-four-items @jobs-list-reopen (desktop, mobile-360); reopen-job | strip out the old kitchen fit six base units hang the new doors paint the walls | Jobs-list Open job navigation is verified at the saved job URL | Round 2: after waiting for navigation, 360×740 PASS (1/1), 1280×740 PASS (1/1); each reaches its own saved job's /overview URL | — (test bug; formerly P2 harness gap) | closed; navigation race fixed; expected-failure binding removed | Local repair base 3a3999b2f; round-2 receipt below |

## RT-12 hosted attack receipt — 28 November 2026

Target: https://sq-preview-jobguard-demo.ben2harwood.workers.dev/jobs/new. Owner-supplied identity:
head `b25b5ee9`, Worker `d7b174a0`; local source HEAD `b25b5ee931ff7bb62bbaa34a47099fddadf514ed`.
The preview exposes no head/version attestation in its response. The `/jobs/new` script-asset SHA-256
`44f496ea4730dbf34bfbac9175f6e8905a94375e1b3a89b0488a2b7eed338aad` matched at the start of all 40 journeys.
This detects changed bundles; it does not independently attest the owner-supplied Worker identity.

Commands actually run:

```sh
pnpm --dir apps/web exec tsc -p tsconfig.json --noEmit --incremental false
JOBGUARD_HOSTED_URL=https://sq-preview-jobguard-demo.ben2harwood.workers.dev pnpm --dir apps/web exec playwright test -c playwright.hosted.config.ts RT-12-right-place.spec.ts --list
RT12_RECORD=1 JOBGUARD_HOSTED_URL=https://sq-preview-jobguard-demo.ben2harwood.workers.dev PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/rt12-hosted-results.json pnpm --dir apps/web exec playwright test -c playwright.hosted.config.ts RT-12-right-place.spec.ts --trace off --workers=2 --reporter=line,json
```

One complete transcript batch ran at 13:58:33–14:02:30 UTC, 236.1 seconds, two workers, no retries, trace off.
Each journey created its own blank practice firm through the entry button, submitted fictional typed words,
checked the captured transcript and job identity, and read the review fields, questions and totals.
Before that batch, a sandbox launch attempt opened no browser; a setup attempt created practice firms but
submitted no transcript and was interrupted after an exact textarea-label selector failed. The selector was
corrected to accept its help text. These are test setup failures, not product findings.

**Verification gap:** all 40 journeys then hit a test-harness strict-locator error at `layout()` because
`.review` matched both Customer and site and Check the work items. No layout, tap-target, HTML execution,
price edit, Save review, reload or reopen assertion executed in this batch. The interruption screenshots
show the review state; they are not save/reopen evidence. This selector is now scoped to the work-item
heading, and layout-harness errors cannot hide under `test.fail`. The repaired flow has not been run against
the preview; the user's one-run limit is retained unless separately amended. There is no persistence PASS.
Playwright printed `40 passed` only because collection mode marked observed failures as expected;
that line is **not acceptance**. The final spec removes collection mode and binds observed product failures
to the IDs above. A new unregistered mismatch fails before any expected-failure annotation.

Review matching is by the builder's work description, not DOM position: the UI legitimately groups all
Kitchen rows before Bathroom rows when the builder returns to the Kitchen. The extra “Back in the kitchen”
work card is still a failure. Correction expectations permit one open row or one £450 row with a question,
as README M5 requires. The observed £400 + £450 rows satisfy neither outcome. Quantities and units left
blank when the script expects the ordinary one-item draft are classified P2; missing said prices are P1.
Room and running totals in these assertions are the itemised draft sum; said room/whole-job amounts must
be retained separately for the builder's review, without creating another work item.

Recorded 83 distinct assertion mismatches, each reproduced at both widths: 11 P0, 57 P1, 15 P2. Rows are assertion-level observations; multiple rows can share one underlying defect. F-005/F-006/F-007/F-008 are not reported again.

The five source fixture files were read without editing. No microphone, paid model, audio upload,
source repair, deployment, push, confirmation or real outbound action was used. No default Playwright
config or port 3000 server was started. Full build/unit/eval/database suites were not run for this attack-only
test change. Typecheck and test discovery results are recorded below after the final edits.

Each screenshot remains a local ignored Playwright artifact under `apps/web/test-results/`; the JSON
report with full `RT12-evidence` attachments is `/tmp/rt12-hosted-results.json`. Do not infer that these
local files were uploaded or committed. Both widths use height 740.

| Script | 360x740 review | 1280x740 review | Layout / edit-save-reload-reopen |
| --- | --- | --- | --- |
| 01-four-items | RT12-01; `apps/web/test-results/RT-12-right-place-RT-12-ty-a0d01-osted-preview-01-four-items-mobile-360/interrupted.png` | RT12-01; `apps/web/test-results/RT-12-right-place-RT-12-ty-a0d01-osted-preview-01-four-items-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 02-two-prices-open | RT12-02; `apps/web/test-results/RT-12-right-place-RT-12-ty-70ea7--preview-02-two-prices-open-mobile-360/interrupted.png` | RT12-02; `apps/web/test-results/RT-12-right-place-RT-12-ty-70ea7--preview-02-two-prices-open-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 03-two-sixty | RT12-03; `apps/web/test-results/RT-12-right-place-RT-12-ty-65a97-hosted-preview-03-two-sixty-mobile-360/interrupted.png` | RT12-03; `apps/web/test-results/RT-12-right-place-RT-12-ty-65a97-hosted-preview-03-two-sixty-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 04-supply-fit | No observed extraction mismatch; `apps/web/test-results/RT-12-right-place-RT-12-ty-f25e3-osted-preview-04-supply-fit-mobile-360/interrupted.png` | No observed extraction mismatch; `apps/web/test-results/RT-12-right-place-RT-12-ty-f25e3-osted-preview-04-supply-fit-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 05-whole-job | RT12-04; `apps/web/test-results/RT-12-right-place-RT-12-ty-9395d-hosted-preview-05-whole-job-mobile-360/interrupted.png` | RT12-04; `apps/web/test-results/RT-12-right-place-RT-12-ty-9395d-hosted-preview-05-whole-job-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 06-money-words | No observed extraction mismatch; `apps/web/test-results/RT-12-right-place-RT-12-ty-f77c2-sted-preview-06-money-words-mobile-360/interrupted.png` | No observed extraction mismatch; `apps/web/test-results/RT-12-right-place-RT-12-ty-f77c2-sted-preview-06-money-words-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 07-thousand | RT12-05; `apps/web/test-results/RT-12-right-place-RT-12-ty-adad6--hosted-preview-07-thousand-mobile-360/interrupted.png` | RT12-05; `apps/web/test-results/RT-12-right-place-RT-12-ty-adad6--hosted-preview-07-thousand-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 08-vat | RT12-06; RT12-07; RT12-08; RT12-09; `apps/web/test-results/RT-12-right-place-RT-12-ty-ff73b-n-the-hosted-preview-08-vat-mobile-360/interrupted.png` | RT12-06; RT12-07; RT12-08; RT12-09; `apps/web/test-results/RT-12-right-place-RT-12-ty-ff73b-n-the-hosted-preview-08-vat-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 09-materials | RT12-10; RT12-11; RT12-12; RT12-13; `apps/web/test-results/RT-12-right-place-RT-12-ty-d74ba-hosted-preview-09-materials-mobile-360/interrupted.png` | RT12-10; RT12-11; RT12-12; RT12-13; `apps/web/test-results/RT-12-right-place-RT-12-ty-d74ba-hosted-preview-09-materials-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 10-correction | RT12-14; RT12-15; RT12-16; RT12-17; RT12-18; RT12-19; `apps/web/test-results/RT-12-right-place-RT-12-ty-e84a3-osted-preview-10-correction-mobile-360/interrupted.png` | RT12-14; RT12-15; RT12-16; RT12-17; RT12-18; RT12-19; `apps/web/test-results/RT-12-right-place-RT-12-ty-e84a3-osted-preview-10-correction-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 11-room-return | RT12-20; RT12-21; RT12-22; RT12-23; RT12-24; `apps/web/test-results/RT-12-right-place-RT-12-ty-60915-sted-preview-11-room-return-mobile-360/interrupted.png` | RT12-20; RT12-21; RT12-22; RT12-23; RT12-24; `apps/web/test-results/RT-12-right-place-RT-12-ty-60915-sted-preview-11-room-return-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 12-bedroom-two | RT12-25; RT12-26; RT12-27; RT12-28; RT12-29; RT12-30; RT12-31; `apps/web/test-results/RT-12-right-place-RT-12-ty-03471-sted-preview-12-bedroom-two-mobile-360/interrupted.png` | RT12-25; RT12-26; RT12-27; RT12-28; RT12-29; RT12-30; RT12-31; `apps/web/test-results/RT-12-right-place-RT-12-ty-03471-sted-preview-12-bedroom-two-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 13-credit | No observed extraction mismatch; `apps/web/test-results/RT-12-right-place-RT-12-ty-8aca9-he-hosted-preview-13-credit-mobile-360/interrupted.png` | No observed extraction mismatch; `apps/web/test-results/RT-12-right-place-RT-12-ty-8aca9-he-hosted-preview-13-credit-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 14-range | RT12-32; `apps/web/test-results/RT-12-right-place-RT-12-ty-c54f7-the-hosted-preview-14-range-mobile-360/interrupted.png` | RT12-32; `apps/web/test-results/RT-12-right-place-RT-12-ty-c54f7-the-hosted-preview-14-range-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 15-total-mismatch | RT12-33; RT12-34; `apps/web/test-results/RT-12-right-place-RT-12-ty-1d3b9-d-preview-15-total-mismatch-mobile-360/interrupted.png` | RT12-33; RT12-34; `apps/web/test-results/RT-12-right-place-RT-12-ty-1d3b9-d-preview-15-total-mismatch-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 16-euro | RT12-35; RT12-36; RT12-37; RT12-38; `apps/web/test-results/RT-12-right-place-RT-12-ty-e5699--the-hosted-preview-16-euro-mobile-360/interrupted.png` | RT12-35; RT12-36; RT12-37; RT12-38; `apps/web/test-results/RT-12-right-place-RT-12-ty-e5699--the-hosted-preview-16-euro-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 17-html | RT12-39; `apps/web/test-results/RT-12-right-place-RT-12-ty-ce65a--the-hosted-preview-17-html-mobile-360/interrupted.png` | RT12-39; `apps/web/test-results/RT-12-right-place-RT-12-ty-ce65a--the-hosted-preview-17-html-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 18-thirty-items | RT12-40; RT12-41; RT12-42; RT12-43; RT12-44; RT12-45; RT12-46; RT12-47; RT12-48; RT12-49; RT12-50; RT12-51; RT12-52; RT12-53; RT12-54; RT12-55; RT12-56; RT12-57; RT12-58; RT12-59; RT12-60; RT12-61; RT12-62; RT12-63; RT12-64; RT12-65; RT12-66; RT12-67; RT12-68; RT12-69; `apps/web/test-results/RT-12-right-place-RT-12-ty-b8661-ted-preview-18-thirty-items-mobile-360/interrupted.png` | RT12-40; RT12-41; RT12-42; RT12-43; RT12-44; RT12-45; RT12-46; RT12-47; RT12-48; RT12-49; RT12-50; RT12-51; RT12-52; RT12-53; RT12-54; RT12-55; RT12-56; RT12-57; RT12-58; RT12-59; RT12-60; RT12-61; RT12-62; RT12-63; RT12-64; RT12-65; RT12-66; RT12-67; RT12-68; RT12-69; `apps/web/test-results/RT-12-right-place-RT-12-ty-b8661-ted-preview-18-thirty-items-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 19-trade-slang | RT12-70; RT12-71; RT12-72; RT12-73; RT12-74; RT12-75; RT12-76; RT12-77; `apps/web/test-results/RT-12-right-place-RT-12-ty-0ca04-sted-preview-19-trade-slang-mobile-360/interrupted.png` | RT12-70; RT12-71; RT12-72; RT12-73; RT12-74; RT12-75; RT12-76; RT12-77; `apps/web/test-results/RT-12-right-place-RT-12-ty-0ca04-sted-preview-19-trade-slang-desktop/interrupted.png` | Unverified: harness stopped before layout |
| 20-room-price | RT12-78; RT12-79; RT12-80; RT12-81; RT12-82; RT12-83; `apps/web/test-results/RT-12-right-place-RT-12-ty-0643e-osted-preview-20-room-price-mobile-360/interrupted.png` | RT12-78; RT12-79; RT12-80; RT12-81; RT12-82; RT12-83; `apps/web/test-results/RT-12-right-place-RT-12-ty-0643e-osted-preview-20-room-price-desktop/interrupted.png` | Unverified: harness stopped before layout |

LATER / SIMPLICITY (initial review): `apps/web/e2e/helpers/spoken-quote-journey.ts` and
`apps/web/e2e/RT-12-right-place.spec.ts` both read review-card fields. After this attack, extend the existing
reader with room/trade fields and reuse it, so accessible-label changes have one maintenance location.
This is non-blocking and no helper refactor was bundled here.

Final local checks after repairs: TypeScript typecheck PASS (exit 0); hosted-config discovery PASS (40 tests); `git diff --check` PASS. No corrective browser run was made.

## RT-12 repair round 1 — 28 November 2026

Triage requested by Ben: RT12-07/08/09/10/12/13 and RT12-81/82 are now P1;
RT12-16/18/19 are duplicates of RT-00-F002, fixed by RT-FIX-2 (user-supplied fix status,
not a fresh preview verification). The original expected/actual cells remain historical observations.
For VAT and materials the governing rule is keep the number as said and ask a question
(RT-02 seed table, `vatWords`); safe open prices are not wrong-money P0s. RT12-81/82 are
missing-price findings, not wrong-price P0s. No line-content assertion was rerun in this round.

Local base: `b52ccc47aaea21dd9a1f41d9322b9eb5f0d234c5`, branch `codex/sandbox/rt-12`.
Same target, owner-supplied head `b25b5ee9`, Worker `d7b174a0`, and entry-asset fingerprint
`44f496ea4730dbf34bfbac9175f6e8905a94375e1b3a89b0488a2b7eed338aad` as the initial receipt.
All 40 entry fingerprint checks matched (no deployment-change skips); this remains bundle-change
detection, not an independent attestation of the owner-supplied version.

Commands actually run (Node 24.17.0; pnpm 10.28.1):

```sh
pnpm --dir apps/web exec tsc -p tsconfig.json --noEmit --incremental false
JOBGUARD_HOSTED_URL=https://sq-preview-jobguard-demo.ben2harwood.workers.dev pnpm --dir apps/web exec playwright test -c playwright.hosted.config.ts RT-12-right-place.spec.ts --grep @layout-save --trace off --workers=2 --list
JOBGUARD_HOSTED_URL=https://sq-preview-jobguard-demo.ben2harwood.workers.dev PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/rt12-round1-layout-save-results.json pnpm --dir apps/web exec playwright test -c playwright.hosted.config.ts RT-12-right-place.spec.ts --grep @layout-save --trace off --workers=2 --reporter=line,json
```

Exactly one browser batch: 14:09:38–14:19:14 UTC, 576.1 seconds, 40 journeys, two workers,
zero retries, trace off. Discovery selected only `@layout-save`. Each journey created its own blank
practice firm, typed the existing fictional script, measured layout, edited the first price to £123.45,
saved, reloaded, clicked the single Jobs-list Open job button, and reopened the saved review directly.
The saved-content assertions compare the edited snapshot, not the parser's line-content expectations.
No split/merge, confirmation, microphone, audio upload, paid model, default Playwright config,
local server, deployment or push was used.

| Check | 360×740 pass / fail | 1280×740 pass / fail |
| --- | --- | --- |
| No horizontal scroll | 20 / 0 | 20 / 0 |
| 44 px control bounding boxes | 0 / 20 (RT12-84) | 0 / 20 (RT12-85) |
| Save review HTTP success and saved notice | 20 / 0 | 20 / 0 |
| Reload edited rows | 20 / 0 | 20 / 0 |
| Reload unchanged transcript | 20 / 0 | 20 / 0 |
| Jobs-list URL sample (harness gap) | 0 / 20 (RT12-86) | 0 / 20 (RT12-86) |
| Direct saved-review reopen edited rows | 20 / 0 | 20 / 0 |
| Direct saved-review reopen unchanged transcript | 20 / 0 | 20 / 0 |
| Reopen same practice firm | 20 / 0 | 20 / 0 |

All 40 also passed own-firm, capture-transcript, initial job identity, HTML/dialog and page-crash
checks. No layout-selector or other caught harness exception occurred. Playwright's raw result was
**0 passed, 40 failed, 0 skipped** (exit 1): every journey found a small-control mismatch and the
immediate URL sample mismatch before new finding IDs were registered. The final source binds those
assertions to `test.fail` with RT12-84/85/86. It was typechecked, not rerun in a second browser batch;
there is no claim of an executed expected-failure/green rerun.

RT12-84/85 measure the existing spec's raw control rectangles, including radio/checkbox rectangles;
this is not a separate measurement of enlarged label hit areas. Visible Save review buttons at 40 px
and text inputs at 42 px are sufficient to fail this check independently of those small inputs.

RT12-86 is a test timing limitation, not a P0 product claim: `Open job →` calls asynchronous
`router.push` in `apps/web/app/(designed)/jobs-screens.tsx`, while the spec samples `page.url()`
immediately after click without `waitForURL`/`toHaveURL`, then navigates directly to the known saved
review URL. All direct reopen content and tenant checks pass. The jobs-list navigation destination
therefore remains **unverified**. The original immediate assertion is explicitly labelled and retained
as an expected failing observation; a synchronized navigation check needs separately authorized
browser execution. No actual wrong job, lost edit or changed transcript was observed.

Each script below has the same result: no-scroll PASS, save/reload/direct-review-reopen PASS,
tap-target FAIL under RT12-84/85, and jobs-list URL sample FAIL under RT12-86. Counts are measured
control rectangles below 44 px; full labels/dimensions remain in the JSON evidence.

| Script | Small controls at 360 | Small controls at 1280 |
| --- | --- | --- |
| 01-four-items | 46 | 58 |
| 02-two-prices-open | 38 | 47 |
| 03-two-sixty | 32 | 38 |
| 04-supply-fit | 23 | 26 |
| 05-whole-job | 39 | 48 |
| 06-money-words | 23 | 26 |
| 07-thousand | 23 | 26 |
| 08-vat | 24 | 27 |
| 09-materials | 23 | 26 |
| 10-correction | 32 | 38 |
| 11-room-return | 52 | 64 |
| 12-bedroom-two | 23 | 26 |
| 13-credit | 33 | 39 |
| 14-range | 24 | 27 |
| 15-total-mismatch | 33 | 39 |
| 16-euro | 23 | 26 |
| 17-html | 32 | 38 |
| 18-thirty-items | 284 | 374 |
| 19-trade-slang | 31 | 37 |
| 20-room-price | 38 | 47 |

Evidence remains local and ignored: `/tmp/rt12-round1-layout-save-results.json` contains all 40
`RT12-evidence` attachments, `/tmp/rt12-round1-evidence.json` is the extracted evidence, and
`apps/web/test-results/` contains `review.png`, `reopened.png`, and error contexts per script/size.
The initial batch artifacts may have been replaced by this Playwright output; its receipt above is
historical. Neither report nor screenshots are claimed uploaded or committed. Only the test source
and this findings file are included in the round-1 results commit; `.pnpm-store/` is excluded.

Post-annotation validation: TypeScript typecheck PASS; hosted-config discovery PASS (40 selected
layout/save tests); `git diff --check` PASS. Full build, unit, database, migration and model-eval suites
were not run for this scoped test/documentation change.

## RT12-86 repair round 2 (last) — 28 November 2026

Local base `3a3999b2fb22223a45d8815ce081422e8cc2a9bd`, branch `codex/sandbox/rt-12`.
The spec now waits for navigation away from `/jobs` before checking the captured job ID.
RT12-86 is closed as a test timing bug, and its `test.fail` registration is removed.
RT12-84/85 and every other finding and assertion remain unchanged.

Only the Jobs-list reopen step was exercised once per size, using the existing fictional
`01-four-items` words. A temporary focused version of the spec reused the repaired Jobs-list
block verbatim, with own-practice-firm capture, edit and save as setup. It omitted line-content,
layout, reload and direct-review-reopen checks, then restored the full spec in `finally`.
The temporary runner/spec are `/tmp/rt12-round2-reopen.py` and
`/tmp/rt12-round2-focused-spec.ts`; neither is committed. The hosted config was unchanged.

Commands actually run (Node 24.17.0; pnpm 10.28.1):

```sh
python3 /tmp/rt12-round2-reopen.py
# Runner performs discovery (--list), then this one browser batch:
JOBGUARD_HOSTED_URL=https://sq-preview-jobguard-demo.ben2harwood.workers.dev PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/rt12-round2-reopen-results.json pnpm --dir apps/web exec playwright test -c playwright.hosted.config.ts RT-12-right-place.spec.ts --grep @jobs-list-reopen --trace off --workers=2 --retries=0 --repeat-each=1 --output=/tmp/rt12-round2-test-results --reporter=line,json
```

The initial sandboxed invocation failed to launch Chromium (`MachPortRendezvousServer:
Permission denied`) before either test contacted the preview. Its launch-error report is
`/tmp/rt12-round2-launch-blocked-results.json`; it is not a product failure. The same runner
then ran with browser-launch permission: 14:25:52–14:26:10 UTC, 18.3 seconds,
**2 passed, 0 failed, 0 skipped**, two workers, zero retries, trace off.

| Size | Jobs-list reopen | Captured job ID in observed `/jobs/<id>/overview` URL |
| --- | --- | --- |
| 360×740 | PASS, 1/1 | `bd366ec1-431a-436f-a360-c4f60142d01b` |
| 1280×740 | PASS, 1/1 | `29319340-63ac-4c5b-a6f4-cdcea39c6028` |

Both entry-asset hashes matched `44f496ea4730dbf34bfbac9175f6e8905a94375e1b3a89b0488a2b7eed338aad`;
the owner-supplied preview head remains `b25b5ee9`, Worker `d7b174a0` (fingerprint matching
is not independent version attestation). Results and URL evidence are in
`/tmp/rt12-round2-reopen-results.json`. This settles the navigation check on the representative
script at both sizes; the 40 historical immediate samples above were not rerun.
No default config, local server, deployment, push, paid API or real customer data was used.

Final validation: `pnpm --dir apps/web exec tsc -p tsconfig.json --noEmit --incremental false`
PASS (also the web package's lint check); `git diff --check` PASS. Full build, unit, database,
migration and model-eval suites were not run for this scoped test/documentation repair.
Only the spec and this findings file are committed; `.pnpm-store/` is excluded.

## RT-12 repair round 2 follow-up — Codex review, PR #1079

Local base `37b6a3053`, branch `codex/sandbox/rt-12`. This is the same repair round.
Each registered check now has its own soft assertion that its observed result remains failing.
A repaired check fails with `Unexpected pass: <finding> (<check>)`, even while another finding
in that journey remains open. Missing registered content checks, unregistered mismatches and
harness errors still fail. F-005 has its own guard; no journey-wide `test.fail` remains.
Expected values and finding registrations are unchanged.

RT-12 now runs through `apps/web/playwright.rt12.config.ts`, which reuses the hosted settings
and selects only this spec. The default hosted config selects only its two existing specs;
neither existing hosted test was edited. The new config is in the RT-12 lane allow-list.
The RT-12 origin and deployment-fingerprint guards remain in place.

Commands actually run (Node 24.17.0; pnpm 10.28.1), all exit 0:

```sh
pnpm --dir apps/web typecheck
JOBGUARD_HOSTED_URL=https://rt12-discovery.invalid pnpm --dir apps/web exec playwright test --list --config playwright.rt12.config.ts
# 80 tests in 1 file: RT-12 only, both projects and both modes.
JOBGUARD_HOSTED_URL=https://other-preview.invalid pnpm --dir apps/web exec playwright test --list --config playwright.hosted.config.ts
# 4 tests in 2 files: HOSTED-preview-firm-start and SPOKEN-QUOTE-REAL, both projects.
git diff --check
```

Discovery only: no browser or preview run, default Playwright config, server, deployment,
push, paid API or customer data. The requested validation excludes full build, unit,
database, migration and model-eval suites. No product code, contracts or migrations changed;
this receipt supplies no new preview results or independent review. `.pnpm-store/` is excluded.
