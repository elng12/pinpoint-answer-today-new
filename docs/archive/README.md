# Archive

This directory stores historical project documents that are useful for context but no longer belong in the active documentation index.

Archived documents should keep their original filenames. When moving a document here, update any links from `docs/README.md`, `worker/README.md`, root `README.md`, and related planning documents in the same commit.

## Current Archive Sets

| Path | Contents |
| --- | --- |
| `2026-03/` | March 2026 cutover, migration, release, smoke-check, SEO cutover, and Vercel environment records. |

## Archive Criteria

Move a document here when all of these are true:

- It records a completed historical event, migration, launch, incident, or checklist.
- It is not the current runbook or source of truth for active operations.
- Existing references have been scanned and updated to the archived path.
- The move is small enough to review as a focused documentation-only change.

Keep a document in the active `docs/` directory when it is still used as a current SOP, PRD, checklist, runbook, regression sample, or operational reference.

## Move Checklist

1. Scan references before moving:

   ```bash
   rg "filename-or-date" README.md docs worker/README.md app components lib scripts package.json
   ```

2. Move with git so history is preserved:

   ```bash
   git mv docs/example.md docs/archive/YYYY-MM/
   ```

3. Update links in the same commit.

4. Re-scan for old paths before committing.
