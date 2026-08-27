# Asset Normalization

This document defines the V1 normalization direction for asset text.

Normalization exists to make user-created asset data more comparable before duplicate checks and later merge workflows.

## Purpose

Normalization should reduce meaningless differences while preserving meaningful multilingual text.

Examples of noise that should not create separate assets:

- extra spaces
- casing differences
- common separator symbols
- full-width and half-width variants that are text-equivalent under Unicode normalization

## V1 Direction

Recommended V1 normalization steps:

1. apply Unicode normalization
2. trim leading and trailing whitespace
3. lowercase where that transformation is appropriate
4. replace common punctuation and separator symbols with spaces
5. collapse repeated internal whitespace

## Important Constraint

Normalization should not aggressively erase multilingual meaning.

V1 should prefer safe equivalence rules over language-specific rewriting.

That means:

- preserve Chinese, Japanese, and other localized text
- avoid over-stemming or dictionary-based language transforms
- normalize formatting noise first

## Why This Matters

Normalization feeds multiple higher layers:

- duplicate detection
- candidate search
- alias comparison
- future canonical merge decisions

If normalization is too weak, duplicates slip through easily.

If normalization is too aggressive, distinct assets may collapse together incorrectly.

## Relationship To Other Modules

- duplicate detection depends on normalized values
- trust lifecycle should not decide normalization rules
- identity resolution may inspect normalized names, but should not replace this module with merge-specific heuristics

## Future Direction

Likely future extensions:

- alias-specific normalization
- locale-sensitive comparison helpers
- tokenization tuned for non-space-delimited languages
- configurable per-game normalization exceptions

## Document Scope

This document defines normalization strategy only.

It does not prescribe a full implementation or scoring model.
