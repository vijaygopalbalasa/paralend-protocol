# Mistakes Log

This document tracks mistakes made during development to avoid repeating them.

---

## Session: 2026-04-16

### Mistake 1: Not checking all instruction accounts after adding new required accounts

**What happened:** Added `protocolState` account to Supply, Borrow, and FlashLoanStart instructions for pause checks, but forgot to update the test file. Flash loan tests failed with "Account `protocolState` not provided."

**Root cause:** Made changes to program without simultaneously updating all consumers (tests, SDK).

**Prevention:**
1. When adding required accounts to instructions, grep for ALL usages across tests and SDK
2. Run `anchor test` immediately after any instruction signature change
3. Use a checklist: Program → IDL → Tests → SDK → Frontend

---

### Mistake 2: Shallow test coverage

**What happened:** Tests only cover happy path. No tests for:
- Error conditions (unauthorized access, invalid inputs)
- Edge cases (zero amounts, max values, overflow protection)
- Security features (pause enforcement, staleness checks)
- Negative tests (operations that should fail)

**Root cause:** Tests written to "make it pass" rather than to verify correctness.

**Prevention:**
1. For every instruction, write: 1 happy path + N negative tests
2. Test error codes explicitly (expect specific ParalendError)
3. Test boundary conditions (0, 1, MAX_VALUE)
4. Test access control on every admin function

---

### Mistake 3: IDL drift between program and frontend

**What happened:** Frontend used stale IDL with old program ID and missing new fields (e.g., `last_update` on StaticOracle, `protocolState` on instructions).

**Root cause:** Manual file copying, no automated sync.

**Prevention:**
1. After `anchor build`, always run: `cp target/idl/paralend.json app/src/lib/paralend-idl.json`
2. After `anchor build`, always run: `cp target/types/paralend.ts app/src/lib/paralend-idl-types.ts`
3. Add a script: `scripts/sync-idl.sh`

---

### Mistake 4: Deploying before all tests pass

**What happened:** Deployed to devnet, then found bugs. Fixing bugs required re-deployment, wasting SOL.

**Root cause:** Rushing to deploy instead of thorough local testing.

**Prevention:**
1. ALL tests must pass before deployment
2. Run `anchor test` at least twice (catches race conditions)
3. Review all TODO/FIXME comments before deploy
4. Deployment is expensive — only deploy when 100% ready

---

### Mistake 5: Not reading existing code before making changes

**What happened:** Made assumptions about how code works without reading it first. Led to incorrect fixes and wasted time.

**Root cause:** Overconfidence, trying to move fast.

**Prevention:**
1. **RULE: Read before write.** Always read the full context of any file being modified.
2. Search for usages of any function/struct being changed
3. Check for related tests that might need updates

---

### Mistake 6: Using `.accountsStrict()` without all accounts

**What happened:** Test used `.accountsStrict()` which requires ALL accounts, but was missing `protocolState`. Failed at runtime.

**Root cause:** Copy-pasted old test code without updating for new instruction signature.

**Prevention:**
1. Prefer `.accounts()` for tests (auto-resolves missing PDAs)
2. If using `.accountsStrict()`, verify against current IDL
3. After changing instruction accounts, search for all `accountsStrict` usages

---

### Mistake 7: Not documenting known limitations

**What happened:** Tasks #4 (slippage protection) and #5 (position closure) were skipped but not documented anywhere. Future developers won't know these are intentionally deferred.

**Root cause:** No formal "deferred features" documentation.

**Prevention:**
1. Update CLAUDE.md with "Known Limitations" section
2. Add TODO comments in relevant code
3. Create GitHub issues for deferred features

---

## Checklist Before Deployment

- [ ] `anchor test` passes 100%
- [ ] `cargo test` passes 100%
- [ ] IDL synced to frontend
- [ ] All TODO/FIXME reviewed
- [ ] CLAUDE.md up to date
- [ ] No hardcoded devnet values that should be mainnet
- [ ] Program ID matches across all files
- [ ] Wallet has sufficient SOL for deployment + buffer

---

## Checklist After Instruction Changes

- [ ] Update tests that use the instruction
- [ ] Update SDK client methods
- [ ] Update frontend calls
- [ ] Rebuild IDL and sync
- [ ] Run full test suite
