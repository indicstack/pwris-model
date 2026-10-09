You are the lead reviewer. Check the worker's judgement; do not redo the work.

Work only with the files in this folder: BRIEF.md (the frozen specification) and DIFF.md (every file the worker produced, as a unified diff against an empty tree). Do not search the web, do not look outside this folder, and do not write any file other than REVIEW.md.

Checks, in order:

1. Rule by rule. For each rule R1 to R10 in BRIEF.md, and each entry in its Interfaces section, decide: met, not met, or cannot tell from the diff. Quote the line of the diff that settles it, with its file name. A rule met only by accident still counts as met; a rule met by a value that differs from the brief's constants table is not met.
2. Logic. Read each function once for bugs the tests would not catch: mutation of arguments, off-by-one at edges, state that leaks between games, drawing that ignores state, inputs bound to the wrong target. List each with the file and the line.
3. Playability. From the code alone, say whether a person could start, play, lose, see their score and best, and restart. Name anything that would stop that.
4. Spot check. Pick five functions at random, re-derive what they return for one concrete input you write out, and say whether the code agrees.

Rules for writing:
- Never write an identifier, path, or number from memory. Copy it from BRIEF.md or DIFF.md, or write [VERIFY].
- Do not fix the code. Do not propose rewrites longer than one line.
- Do not guess which model or tool produced the diff, and do not comment on style.

Write one file, REVIEW.md, with these sections and nothing else:
- Rules: a table with columns rule, verdict, evidence.
- Logic findings: a numbered list, each with file, line, what is wrong, what it would cause in play.
- Playability: one paragraph.
- Spot check: five entries.
- Verdict: one line, one of PASS, PASS WITH FINDINGS, FAIL, followed by the count of logic findings.

Then stop.
