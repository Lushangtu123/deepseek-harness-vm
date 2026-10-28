import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { EvidenceLedger } from '../package/lib/redteam/evidence-ledger.mjs'

function fixture(t) {
  const db = new DatabaseSync(':memory:')
  t.after(() => db.close())
  return { db, ledger: new EvidenceLedger(db) }
}
const claim = () => ({ operation: 'bash', parameters: { cwd: '/fixture', command: 'printf ok' },
  result: { stdout: 'ok', exitCode: 0 }, engagement_id: 'fixture-a' })

test('agent-provided records default to claimed/operator-input', (t) => {
  const { ledger } = fixture(t)
  const row = ledger.get(ledger.record(claim()).ev_id)
  assert.equal(row.confidence, 'claimed')
  assert.equal(row.authority, 'operator-input')
})

test('agent cannot mint observed/tool-output evidence', (t) => {
  const { ledger } = fixture(t)
  assert.equal(ledger.record({ ...claim(), confidence: 'observed', authority: 'tool-output' }).ok, false)
})

test('upgrade cannot reuse a claim without a native receipt', (t) => {
  const { ledger } = fixture(t)
  const c = ledger.record({ ...claim(), confidence: 'claimed', authority: 'subagent-report' })
  assert.equal(ledger.upgrade({ claimed_ev_id: c.ev_id, verified_result: claim().result }).ok, false)
  assert.equal(ledger.get(c.ev_id).confidence, 'claimed')
})

test('database count failure is unavailable rather than verified zero', (t) => {
  const { db, ledger } = fixture(t)
  db.exec('DROP TABLE evidence')
  assert.throws(() => ledger.countUnresolvedClaims('fixture-a'), /unavailable/i)
  assert.throws(() => ledger.countUnverified('fixture-a'), /unavailable/i)
})

test('native receipt validates engagement, operation, target, parameters and result', async (t) => {
  const { db, ledger } = fixture(t)
  const { recordNativeReceipt } = await import('../package/lib/redteam/personal-evidence-receipts.mjs')
  const original = claim()
  const receipt = recordNativeReceipt(db, { ...original, tool_call_id: 'call-fixture-1' })
  const c = ledger.record({ ...original, authority: 'subagent-report' })
  const valid = ledger.upgrade({ claimed_ev_id: c.ev_id, receipt_id: receipt.receipt_id })
  assert.equal(valid.ok, true)
  assert.equal(ledger.get(valid.ev_id).confidence, 'observed')
  assert.equal(ledger.get(c.ev_id).confidence, 'claimed')
  for (const patch of [
    { engagement_id: 'fixture-b' }, { operation: 'read' },
    { parameters: { ...original.parameters, cwd: '/other' } },
    { parameters: { ...original.parameters, command: 'printf different' } },
    { result: { stdout: 'different', exitCode: 0 } },
  ]) {
    const mismatched = ledger.record({ ...original, ...patch })
    assert.equal(ledger.upgrade({ claimed_ev_id: mismatched.ev_id,
      receipt_id: receipt.receipt_id }).ok, false, JSON.stringify(patch))
  }
  assert.equal(ledger.upgrade({ claimed_ev_id: c.ev_id, receipt_id: receipt.receipt_id,
    verified_result: { stdout: 'made-up', exitCode: 0 } }).ok, false)
})

test('native receipts are insert-only and duplicate call IDs cannot be replaced', async (t) => {
  const { db } = fixture(t)
  const { recordNativeReceipt } = await import('../package/lib/redteam/personal-evidence-receipts.mjs')
  const receipt = recordNativeReceipt(db, { ...claim(), tool_call_id: 'call-fixture-1' })
  assert.throws(() => db.prepare('UPDATE native_execution_receipt SET result_digest = ? WHERE receipt_id = ?')
    .run('fake', receipt.receipt_id), /immutable/i)
  assert.throws(() => db.prepare('DELETE FROM native_execution_receipt WHERE receipt_id = ?')
    .run(receipt.receipt_id), /immutable/i)
  assert.throws(() => recordNativeReceipt(db, { ...claim(), tool_call_id: 'call-fixture-1', result: {} }), /already|duplicate|conflict/i)
})

test('native result observer captures only successful bound native calls and disposes', async (t) => {
  const { db } = fixture(t)
  const { installNativeEvidenceObserver, listNativeReceipts } = await import('../package/lib/redteam/personal-evidence-receipts.mjs')
  let listener
  let dispose
  let removed = false
  const ctx = {
    on(name, handler) { assert.equal(name, 'tools/result'); listener = handler; return () => { removed = true } },
    effect(fn) { dispose = fn() },
    logger: { warn() {} },
  }
  installNativeEvidenceObserver(ctx, { db: () => db }, exec => exec.agent?.bound)
  const exec = { name: 'bash', callId: 'native-fixture', arguments: claim().parameters, agent: { bound: 'fixture-a' } }
  listener({ ...exec, name: 'redteam_evidence_record' }, { value: claim().result })
  listener({ ...exec, agent: {} }, { value: claim().result })
  listener({ ...exec, callId: 'failure' }, { isError: true, value: { stdout: 'failed', exitCode: 1 } })
  listener({ ...exec, callId: 'nonzero' }, { value: { stdout: 'failed', exitCode: 7 } })
  listener(exec, { isError: false, value: claim().result })
  assert.equal(listNativeReceipts(db, 'fixture-a').length, 1)
  dispose()
  assert.equal(removed, true)
})
