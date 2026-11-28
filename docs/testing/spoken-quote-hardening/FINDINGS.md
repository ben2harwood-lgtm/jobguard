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
| RT-05-F001 | RT-05 | ac8065af7305d9cc3db110eff4eb38d47248fa51 | RT-05-204, RT-05-205, RT-05-206, RT-05-207, RT-05-208, RT-05-209, RT-05-210, RT-05-211 | paint the ceiling for up to er fifty pounds | One Decorating line; null price and a price question. A filler cannot turn an upper or lower limit into a fixed charge. | Capture, zero-spend fixture gateway, Reader A and checked Reader A keep +5000 pence without a price question. Eight disfluent limit cases retain their respective 5000–30000 pence amounts; the corresponding fluent controls stay open. | P0 | open | — |
| RT-05-F002 | RT-05 | ac8065af7305d9cc3db110eff4eb38d47248fa51 | RT-05-212, RT-05-213, RT-05-214, RT-05-215, RT-05-216, RT-05-217, RT-05-218, RT-05-219 | paint the ceiling for about er fifty pounds | One Decorating line; null price and a price question. About/around/roughly/maybe/probably/say/ballpark/reckon remain hedges across a filler. | All four tested paths keep +5000 pence without a price question. Eight disfluent hedge cases retain 5000–30000 pence as fixed prices; fluent controls stay open. | P0 | open | — |
| RT-05-F003 | RT-05 | ac8065af7305d9cc3db110eff4eb38d47248fa51 | RT-05-220, RT-05-221, RT-05-222, RT-05-223, RT-05-224, RT-05-225, RT-05-226, RT-05-227 | paint the ceiling for minus er fifty pounds | One open line and a price question; a deduction or refund is never a positive charge even with er/um/erm/like/you know before the amount. | All four tested paths keep +5000 pence without a price question. Eight deductions/credits/refunds retain +5000–30000 pence; fluent controls stay open. | P0 | open | — |
| RT-05-F004 | RT-05 | ac8065af7305d9cc3db110eff4eb38d47248fa51 | RT-05-228, RT-05-229, RT-05-230, RT-05-231, RT-05-232, RT-05-233, RT-05-234, RT-05-235 | paint the ceiling for fifty pounds er tops | One open line and a price question; tops/maximum/or so/minimum/off the bill/credit/back/ish still qualify an amount after a filler. | Capture and the fixture gateway retain +5000 pence, with a price question. Reader A and checked Reader A safely clear it. All eight trailing-filler cases retain 5000–30000 pence on the capture path; fluent controls stay open. | P0 | open | — |
| RT-05-F005 | RT-05 | ac8065af7305d9cc3db110eff4eb38d47248fa51 | RT-05-008, RT-05-009, RT-05-010, RT-05-011, RT-05-012, RT-05-013, RT-05-014, RT-05-015, RT-05-016, RT-05-019, RT-05-020, RT-05-022, RT-05-023, RT-05-024, RT-05-026, RT-05-027, RT-05-028, RT-05-030, RT-05-031, RT-05-032, RT-05-034, RT-05-035, RT-05-037, RT-05-038, RT-05-040, RT-05-042, RT-05-043, RT-05-044, RT-05-046, RT-05-048, RT-05-051, RT-05-054, RT-05-057, RT-05-060, RT-05-063, RT-05-066, RT-05-069, RT-05-072, RT-05-075 | er fit the door for a hundred pounds | Keep the single door-fitting line and its exact 10000-pence price through leading conversational words. | Capture, fixture gateway, Reader A and checked Reader A return one unpriced line for the representative er case. Other discourse prefixes lose the exact price on capture and sometimes Reader A. Scope remains readable; this is lost money, not invented money. The known leading-room-only fallback is reused as RV2-03 instead. | P1 | open | — |
| RT-05-F006 | RT-05 | ac8065af7305d9cc3db110eff4eb38d47248fa51 | RT-05-007, RT-05-017, RT-05-021, RT-05-025, RT-05-029, RT-05-033, RT-05-036, RT-05-039, RT-05-045, RT-05-178 | paint the hall for ninety pounds pal | Keep the Hall paint line at exactly 9000 pence; pal is conversational address, not a qualification of money. | Capture retains 9000 with an inclusion question. Reader A and checked Reader A clear it and ask about price. The same safe-but-lost-price failure occurs with like/bostin/mate/nice one/mind/lovely/so it is/together/you know. | P1 | open | — |
| RT-05-F007 | RT-05 | ac8065af7305d9cc3db110eff4eb38d47248fa51 | RT-05-001, RT-05-003, RT-05-006, RT-05-112, RT-05-113, RT-05-115, RT-05-116, RT-05-118, RT-05-119, RT-05-120, RT-05-125, RT-05-126, RT-05-127, RT-05-129, RT-05-131, RT-05-137, RT-05-138, RT-05-153, RT-05-175, RT-05-176 | second fix sparks in the extension six hundred | Second fix sparks is Electrics in Extension; six hundred is 60000 pence. Other explicit trade slang should infer its corresponding trade. | The representative Reader A line is Other in Whole job with null price; capture is also unpriced. Narrow trade-only tests independently reproduce missing sparks/spark/electrics/CU/chippy/noggins/P-trap/combi/rads/dot and dab/bonding/screed/latex/gut it/rip it all out mappings. Existing grand-price loss and lounge-walls suppression are referenced, not reported again. | P1 | open | — |
| RT-05-F008 | RT-05 | ac8065af7305d9cc3db110eff4eb38d47248fa51 | RT-05-158, RT-05-159, RT-05-160, RT-05-161, RT-05-162, RT-05-163, RT-05-164, RT-05-166, RT-05-167 | in the scullery fit the shelves for eighty pounds | The shelf-fitting line belongs to the stated Scullery at 8000 pence; preserve local room identity. | Reader A and checked Reader A keep the 8000-pence shelf line under Whole job, with no room question. Scullery, Press, Hot press, Box room, Front room, Boot room, Wet room and upstairs/downstairs loo all lose the stated room. Capture also leaves the single prefixed line unpriced (the existing prefix issue). | P1 | open | — |
| RT-05-F009 | RT-05 | ac8065af7305d9cc3db110eff4eb38d47248fa51 | RT-05-170 | er fit the door for eighty pounds then um paint the ceiling for sixty pounds | Two work lines: fit the door 8000 pence and paint the ceiling 6000 pence, regardless of er/um. | Capture merges both into one unpriced line. Reader A and checked Reader A retain only paint the ceiling at 6000; door-fitting goes to the title rather than a line or question. No question recovers that work. | P1 | open | — |
| RT-05-F010 | RT-05 | ac8065af7305d9cc3db110eff4eb38d47248fa51 | RT-05-047 | sink we will fit for a hundred pounds | One sink-fitting work line at 10000 pence, Plumbing. Object-first speech still says what is being fitted. | Reader A and checked Reader A keep only the description fit at 10000, trade Other; sink we will is treated as the title and no question recovers the sink. Capture keeps the full words but leaves the exact price open. | P1 | open | — |
| RT-05-F011 | RT-05 | ac8065af7305d9cc3db110eff4eb38d47248fa51 | RT-05-002, RT-05-005 | fit four doors for forty each | Four doors, 4000 pence each; no invented multiplication. The other normative seed needs suite 120000 and tiling 40000 as separate lines. | Reader A retains four doors but no rate, priceBasis none, and no price question. Capture leaves count/unit/price null. In the Scots bathroom seed both paths return one unpriced line rather than two prices. These are explicit currency-free prices from the lane seeds, not ambiguous one-fifty shorthand. | P1 | open | — |
| RT-05-F012 | RT-05 | ac8065af7305d9cc3db110eff4eb38d47248fa51 | RT-05-193, RT-05-194, RT-05-199, RT-05-200 | fit the door for 150quid | One door-fitting line at 15000 pence: 150quid is still an explicit amount. Glued currency and for150 must not lose a price. | Capture and Reader A return null instead of 15000; Reader A has no price question. The same boundary issue loses 80pounds and for150 pounds. The combined 2doors/150quid case also loses the physical count. | P1 | open | — |
| RT-05-F013 | RT-05 | ac8065af7305d9cc3db110eff4eb38d47248fa51 | RT-05-195, RT-05-196 | fit 2doors for a hundred pounds | One Carpentry line containing two doors; keep quantity 2 and unit doors while retaining the said 10000-pence line price. | Capture defaults to 1 item; Reader A and checked Reader A have null quantity/unit and trade Other. The explicit 10000-pence price survives. 4sockets likewise loses count/unit and the Electrics trade. | P1 | open | — |
| RT-05-F014 | RT-05 | ac8065af7305d9cc3db110eff4eb38d47248fa51 | RT-05-100, RT-05-101, RT-05-102, RT-05-183, RT-05-189, RT-05-198 | fit four doors for a hundred pounds | Preserve four doors as quantity 4/unit doors with 10000 pence and line price basis; a lump sum does not require erasing the count. | Capture replaces the stated physical count with default 1 item; Reader A and checked Reader A null the count and unit. Both retain 10000 and ask about line-versus-each, but lose the structured quantity. Includes two/eight doors, two sockets in all caps/title case, and six base units. | P1 | open | — |
| RT-05-F015 | RT-05 | ac8065af7305d9cc3db110eff4eb38d47248fa51 | RT-05-197 | lay 12 square metres of vinyl for two hundred pounds | One Flooring line: 12 square metres of vinyl, exact 20000-pence lump sum with line basis; no division or multiplication. | Capture retains 20000 as a line price (default 1 item). Reader A and checked Reader A keep quantity 12 and m² but discard the explicit 20000-pence lump sum without a price question. | P1 | open | — |

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

## RV-2, RV-4 and RV-5 review findings (documentation only)

Recorded from RV-2.md, RV-4.md and RV-5.md at their reported head `b25b5ee9`, preserving their reported inputs, severity, expectations and observations. These rows are reports, not new reproductions or fixes. No corpus, parser, API or UI changes belong to this documentation-only commit. RV-2 has eight P1 and one P2 findings; RV-4 has four P1; RV-5 has three P1.

| ID | Lane | Head sha | Case id | Transcript / exact input | Expected | Actual | Sev | Status | Fix PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RV2-01 | RV-2 | b25b5ee9 | review only | `Take out the old sink. Fit a basin for £200. Tile the floor for £300.` | “Take out” work disappears as timing:  Three work rows, including sink removal. | Only basin fitting and floor tiling reach review. Sink removal becomes a timing question. Reader A retains it correctly. | P1 | open (reported; not reverified in RT-FIX-5) | — |
| RV2-02 | RV-2 | b25b5ee9 | review only | `Repoint the chimney for £500. Fit a door for £200. Paint the ceiling for £100.` | An unrecognised first work verb loses the item and price:  Three rows, including £500 chimney repointing. | Review contains only the £200 door and £100 ceiling. “Repoint” is absent from this path’s work verbs, so its clause becomes the title and disappears from scope. | P1 | open (reported; not reverified in RT-FIX-5) | — |
| RV2-03 | RV-2 | b25b5ee9 | review only | `Kitchen. Supply and fit a door for £200.` | One item after a room heading loses its parsed price and trade:  Door row; Kitchen; Carpentry; £200. | One row containing the entire input; Kitchen; **Kitchen fitting**; price `null`. The single-item condition rejects work preceded by a room heading and falls back to the whole source. | P1 | open (reported; not reverified in RT-FIX-5) | — |
| RV2-04 | RV-2 | b25b5ee9 | review only | `Fit a door for £200 and have the plumber move the sink for £120. Paint the ceiling for £100.` | Delegated work stays merged despite `splitWithin` separating it:  Three separately priced rows: door £200, sink relocation £120, ceiling £100. | Door and sink relocation form one **Carpentry** row with price `null`; ceiling remains £100. Reader A produces all three correctly, but `understoodLabels` only labels the original proposal rows—it does not replace their splitting. | P1 | open (reported; not reverified in RT-FIX-5) | — |
| RV2-05 | RV-2 | b25b5ee9 | review only | `Kitchen. Fit a door for £200. Paint the lounge walls for £300. Fit two sockets for £120.` | A room followed by “walls” fails to change placement:  Door in Kitchen; painting and subsequent sockets in Lounge. | All three rows remain in Kitchen. The room regex explicitly excludes room names followed by “walls”, suppressing the stated Lounge transition. | P1 | open (reported; not reverified in RT-FIX-5) | — |
| RV2-06 | RV-2 | b25b5ee9 | review only | `Kitchen. Fit a door for £200 then bathroom. Fit a basin for £120.` | Punctuation prevents a trailing room from carrying forward:  Door in Kitchen; basin in Bathroom. | Basin remains in Kitchen. The preceding row retains `then bathroom` in its description; Reader A also leaves that row’s price open. The full stop prevents the pending-room transition. | P1 | open (reported; not reverified in RT-FIX-5) | — |
| RV2-07 | RV-2 | b25b5ee9 | review only | `Bathroom. Tile the shower walls for £400. Fit a basin for £100.` | Shower tiling is assigned to Plumbing:  Shower-wall row classified as Tiling. | It reaches review as **Plumbing**, retaining £400. The Plumbing match on “shower” wins before the Tiling rule sees “Tile”. | P1 | open (reported; not reverified in RT-FIX-5) | — |
| RV2-08 | RV-2 | b25b5ee9 | review only | `Fit a light oak door for £200. Fit a basin for £100.` | “Light” as a colour assigns a door to Electrics:  Door classified as Carpentry. | Door reaches review as **Electrics**, retaining £200. The unqualified `lights?` keyword matches the adjective “light” before Carpentry matches “door”. | P1 | open (reported; not reverified in RT-FIX-5) | — |
| RV2-09 | RV-2 | b25b5ee9 | review only | `Bathroom. Tile the floor for £300. Paint the ceiling for £100.` | F-010: recognised trades are deliberately hidden, or superseded by saved labels:  Pre-filled Tiling and Decorating. | Both rendered trade selectors select **Other**. `planSafeCategory` deliberately masks these trades to prevent unrelated work-plan templates attaching.<br>   This is **not universal absence of pre-filled trades**: `Kitchen. Fit a door for £200. Fit two sockets for £100.` renders Carpentry and Electrics correctly. However, with an existing saved review whose rows contain `room="Practice job", category="Work"`, that same input renders Other for both. Saved reviews take precedence, and `legacy()` converts those old labels to Whole job/Other. | P2 | open (reported; not reverified in RT-FIX-5) | — |
| RV4-01 | RV-4 | b25b5ee9 | review only | Submit `Fictional room. Protect room £200.00.`; lose the response after persistence; reload, paste identical text and retry. | Reload loses capture retry identity:  Recover the original job using the same capture ID. | Two different capture IDs. Executing the real parser and repository against an in-memory SQL port produced two `app.job` insertions with different job IDs. | P1 | open (reported; not reverified in RT-FIX-5) | — |
| RV4-02 | RV-4 | b25b5ee9 | review only | Confirm accepted line `Paint walls`; let `/review` succeed; hold `/confirm` pending. Change the still-enabled description to `Paint walls AND ceiling`, then deliver confirmation success. | Editing during confirmation loses the edit:  Prevent editing during confirmation, or retain the edit and require confirmation again. | The screen reports “Scope confirmed” and hides the edit. The submitted and saved description remains `Paint walls`. | P1 | open (reported; not reverified in RT-FIX-5) | — |
| RV4-03 | RV-4 | b25b5ee9 | review only | On accepted `Paint walls`, replace price `200.00` with `250.001`; click **Confirm scope**. | Invalid price becomes an unknown price and confirmation succeeds:  Block submission until the displayed price error is corrected; retain the entered value. | Despite displaying the decimal-place error, `/review` receives `unitPricePence: null`, followed by `/confirm`. Confirmation succeeds, losing the original £200 price and the entered replacement. | P1 | open (reported; not reverified in RT-FIX-5) | — |
| RV4-04 | RV-4 | b25b5ee9 | review only | Finalize `Paint walls` and end listening. Start listening again, receive provisional `and fit shelves`, then click **Cancel dictation**. | Cancelling another dictation deletes the earlier completed transcript:  Cancel the new recording while preserving completed words already available for review. | `Paint walls` is cleared too. The transcript textarea and **Use these words** disappear. | P1 | open (reported; not reverified in RT-FIX-5) | — |
| RV5-01 | RV-5 | b25b5ee9 | review only | `JOB: Kitchen`<br>`Remove cabinets for £400.`<br>`ITEM: Fit doors \| £300.00`<br>`Tile splashback for £200.` | One `ITEM:` line silently drops surrounding work:  Preserve all three work items, or flag the mixed grammar for resolution. | `extractCaptureFixture` returns only `Fit doors`, priced at `30000` pence. The rendered review contains only that description input. Both surrounding items and their £600 disappear from the proposed scope; the only question concerns disposal. The original text remains available in source details. | P1 | open (reported; not reverified in RT-FIX-5) | — |
| RV5-02 | RV-5 | b25b5ee9 | review only | `JOB: Kitchen`<br>`ITEM: Paint walls \| Fit new shelf \| £200.00` | Unrecognised pipe cells silently remove work from a description:  Preserve `Fit new shelf` in the proposed work, or ask the user to resolve the unsupported cell. | Extraction and the rendered review show only `Paint walls`, priced at `20000` pence. `Fit new shelf` is omitted without a question or warning. The original source remains available. | P1 | open (reported; not reverified in RT-FIX-5) | — |
| RV5-03 | RV-5 | b25b5ee9 | review only | `"Paint " + "one ".repeat(12497) + "wall"` | Valid-length input blocks parsing for over one second:  Process or reject this 49,998-character input within one second. | Three consecutive warmed `extractCaptureFixture` calls took **1,300 ms, 1,302 ms and 1,312 ms**. Each returned successfully after synchronous parsing blocked execution. The gateway’s 1,000 ms timeout starts after parsing and therefore does not bound this work. | P1 | open (reported; not reverified in RT-FIX-5) | — |
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

## RT-05 attack receipt — 28 November 2026

Branch `codex/sandbox/rt-05`; local `HEAD_UNDER_TEST` / branch base
`ac8065af7305d9cc3db110eff4eb38d47248fa51`. Task #1071. The newer plan was read from
`../lanes-ref/docs/testing/spoken-quote-hardening/README.md` and
`../lanes-ref/docs/testing/spoken-quote-hardening/lanes/RT-05-speech-realism.md`.
This is a deterministic transcript attack, not an audio-recognition or deployed-preview test.

The corpus contains **235 distinct transcripts: 76 pass, 159 open-finding**. Open cases by severity:
**P0 32, P1 127, P2 0**. There are **15 new grouped findings: 4 P0, 11 P1, 0 P2**.
Of the 159 open cases, 32 reuse existing findings (`RV2-02`: 27, `RV2-03`: 5); the remaining
127 refer to new RT-05 findings. Every new finding row records the base sha and all its primary
case IDs. Known grand-price loss (`RT-01-F060`) and lounge-walls room suppression (`RV2-05`)
are cross-referenced in the affected seed cases. F-005/F-006/F-007/F-008 are not reported again.
Passing cases have no finding severity; the severity counts above classify open cases.

| New P0 | Cases | Failure |
| --- | ---: | --- |
| RT-05-F001 | 8 | A filler before money bypasses upper/lower limits |
| RT-05-F002 | 8 | A filler before money bypasses hedges |
| RT-05-F003 | 8 | A filler turns deductions, credits and refunds into positive charges |
| RT-05-F004 | 8 | A filler after money bypasses trailing qualifiers on capture |

Expectations were authored from the spoken words, including all six normative lane seeds.
Patterns cover regional discourse, first-language English variants, fillers in different positions,
number/currency/trade homophone contrasts, trade slang, local room names, all caps/title case,
glued recogniser tokens and three 25-item quotes without punctuation. Region labels describe
synthetic word patterns; they do not establish recognition accuracy for a speaker or accent.

Expectation review: cases RT-05-096–099 originally required a null quantity on both paths.
That was too strict for capture's documented **defaulted one draft line**, which makes no
extracted physical-count claim. Their corpus checks retain the exact said money/work; separate
focused checks require Reader A's physical count to stay null and capture's count provenance to
stay defaulted. No for/to/ate/won word is accepted as an extracted number. RT-05-165 treats
“wee” as a size adjective and expects Bathroom, consistent with the normative Scots seed.
These are expectation interpretations, not product findings. All actual price/room/trade/count
failures retain their word-derived expected values.

The existing corpus runner is unchanged and executes both parsers plus the checked reader.
The additional 346 focused tests include separate price and question assertions on each of
capture, the zero-spend fixture gateway, Reader A and checked Reader A for every new P0 case.
Fluent controls for all 32 disfluent attacks pass on all four paths. Narrow P1 symptom tests
prevent a remaining secondary mismatch from hiding a repaired trade, room, count or price.
The focused suite has **251 expected failures and 95 ordinary passes**; unexpected recovery of
an expected failure fails the suite, as does recovery of any corpus open-finding case.

Commands actually run, Node 24.17.0 / pnpm 10.28.1, all final checks exit 0:

```sh
pnpm --dir packages/core build
pnpm --dir packages/ai exec vitest run src/redteam --maxWorkers=2
pnpm --dir packages/ai typecheck
pnpm --dir packages/ai lint
pnpm --dir packages/ai build
pnpm --dir packages/ai exec vitest run --exclude src/redteam/RT-05-speech-realism.test.ts --testNamePattern '^(?!.*RT-05)' --maxWorkers=2
pnpm eval --maxWorkers=2
git diff --check
```

The initial test invocation could not import the unbuilt core package; building its existing
entry point resolved that setup issue. Temporary diagnostics were removed before final checks.
The existing-suite control run (performed after authoring, with RT-05 excluded) reports
**28 files, 1239 passed, 235 RT-05 cases skipped**. The final full AI/eval run reports
**29 files, 1569 passed plus 251 expected failures = 1820 tests**, with no skips or unexpected
failures. The focused red-team run reports **1072 passed plus 251 expected failures**.
Logs are local only: `/tmp/rt05-baseline-tests.log`, `/tmp/rt05-ai-tests-final.log`.

Existing deterministic SQ-C scores are unchanged at base and final: all product parser,
number-checker and fixture bytes are unchanged. Both the existing-suite control and final
full run pass their unchanged gates; scores were also inspected using the built evaluator.
Held-out room/trade percentages are descriptive, while their existing hard gates require zero
wrong numbers and zero invented work. Their historic omissions remain visible below.

| Existing set | Wrong numbers / invented work | Rooms right | Trades right | Missed work | Questions |
| --- | --- | --- | --- | ---: | --- |
| Main, 30 transcripts | 0 / 0 | 82/82 | 82/82 | 0 | 15/15 |
| Held-out, 10 transcripts | 0 / 0 | 30/40 | 28/40 | 9 | 7/9 |
| Held-out 2, 10 transcripts | 0 / 0 | 15/30 | 14/30 | 9 | 2/4 |

No existing golden fixture or evaluation hash was changed. New RT-05 corpus SHA-256:
`ef9a2ac7a19649aa8266cbd23ad787b0a1b70aa4b4f821da9b6a01543af72b8f`.
A local integrity check verified 235 unique transcripts, all open-finding references, every new
finding's exact base sha/case membership, and unchanged parser/number-checker bytes.

Initial source inspection — **LATER / SIMPLICITY**:
`packages/ai/src/capture-fixture-parser.ts:saidAmountOpen` is already shared by line prices,
totals and the numeric checker. A later qualifier repair should keep ownership there rather
than add a separate speech-only price validator; one qualifier policy reduces drift across
capture and the reader. This is non-blocking and no repair is included here.

Only the corpus, focused tests, findings and `config/lanes/v2-rt-05.json` are included.
No source, prompt, model, commercial policy, migration or web workflow changed. Root-wide,
database, migration, browser, native and live-model suites were not run for this scoped test
addition. No default Playwright config, local server, port 3000/55432, deployment, remote push,
paid provider or real customer data was used. `.pnpm-store/` remains untracked and excluded.
These results are test-executed evidence; independent review, acceptance and release are not claimed.

Lane validation: the existing `mergeLanePolicy`, `selectLane` and `lanePathAllowed` helpers
pass RT-05's own lane shape, exact branch and all four intended paths. Loading the entire
repository lane policy fails on the pre-existing `config/lanes/v2-rt-12.json`, which grants a
lane-register path forbidden by the current checker. That file is byte-identical to the base
and outside this attack's allow-list; it was not changed. A repository-wide lane pass is
therefore not claimed. The Git index for this linked worktree is outside the writable
workspace; staging/committing the four authorized files requires filesystem escalation only.
## RT-FIX-5 repair round 1 — Codex review of PR #1085 at ac8065af

Base `ac8065af`, branch `codex/sandbox/rt-fix-5`. Both reported money/loss paths are repaired locally:

- `context-reader.ts`, existing `totals()` scanner: an extended clause is scanned once, and only a clause with one candidate amount can supply a total. A later overlapping `all in` cannot rescue £600 after the first scan rejected £500/£600. Two or three conflicting/overlapping amounts, including a repeated identical amount in the same extended clause, leave the whole-job price open with a question. Separate identical totals remain deduplicated by the existing reader logic. The proximity heuristic and price-count rescan state are removed; no second guard is introduced.
- `capture-fixture-parser.ts`, existing `plainDraft()` splitter: conditions no longer veto every subsequent separator or work verb. Explicit `then`, sentence endings, `and` followed by work, and a new untied work verb start the next clause. The existing tied-word list includes `is`/`are`, preserving “provided access is clear” as one conditional clause. The walls' £200 remains open; the separate door line retains its cited £300. The shared `saidAmountOpen()` guard is unchanged; core needs no change.
- RV-01 adds 12 regression cases: seven overlapping/conflicting/repeated-total variants and five conditional-next-item variants, covering every requested example. Existing corpus cases and test files are unchanged. Before the code repair, the existing runner reported 8 failures / 746 passes with these additions, reproducing both findings; sentence boundaries and separately repeated/conflicting totals already passed.

Commands and deterministic results (Node 24.17.0; pnpm 10.28.1):

| Check | Result |
| --- | --- |
| Before: `pnpm eval --maxWorkers=2` | exit 0; 28 files, 1,239 tests passed |
| Regression reproduction: `pnpm --filter @jobguard/ai exec vitest run src/redteam/corpus.test.ts --maxWorkers=2` | suite exit 1; 8 new regression failures, 746 passes |
| After: `pnpm --filter @jobguard/ai exec vitest run src/redteam/corpus.test.ts src/capture-qualified-price.test.ts --maxWorkers=2` | exit 0; 2 files, 773 tests passed |
| After: `pnpm eval --maxWorkers=2` | exit 0; 28 files, 1,251 tests passed |
| `pnpm --filter @jobguard/core --filter @jobguard/ai typecheck` | exit 0 |
| `pnpm --filter @jobguard/core --filter @jobguard/ai lint` | exit 0 |
| `pnpm --filter @jobguard/core --filter @jobguard/ai build` | exit 0 |
| Node before/after evaluation-score equality and fresh-build golden-record verification | exit 0 |
| `git diff --check` | exit 0 |

Golden scores before and after are identical: 32/32 cases; scope recall 41/41; valid citations 119/119; unsupported monetary facts 0; ambiguity checks 63/63. Only the parser implementation SHA-256 changes in `golden-run.v1.json`; no labels, scores, targets or prediction hashes change. Every existing corpus status/expectation and `capture-qualified-price.test.ts` is preserved. Existing open corpus findings remain open.

Invariants touched: ambiguous money stays open with a question; conditional prices never become exact prices; a separate work item and its cited money are preserved. No migrations, interface changes, new alerts or commercial-policy changes. Database, browser/native and live-provider suites were not run because this is a deterministic parser-only repair with no affected persistence, UI or provider path. These checks are not independent RED review or release approval; review against the final committed head remains required before merge. Commit only, no push. `.pnpm-store/` is excluded.
