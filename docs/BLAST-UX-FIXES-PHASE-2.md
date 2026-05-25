# BLAST UX FIXES — Phase 2

> Created: 2026-05-13
> Status: Planning
> Priority: P0 — blocks testing/launch

---

## ISSUES IDENTIFIED

### 1. Header Overlap on All Blast Screens ⚠️
**Current**: Multiple screens load with content behind sticky header, requiring scroll
**Locations**:
- `/rider/blast/new` - Name step (pt-20 insufficient)
- `/rider/blast/new` - Photo step "Almost there" header
- `/rider/browse/blast` - Content starts immediately after header

**Root cause**: Sticky header is `top-0` but content doesn't account for header height + safe spacing

###