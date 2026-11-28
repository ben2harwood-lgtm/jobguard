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
