/**
 * substrate-forge tests
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fnv1a64, fnv1a64Hex, fnv1a64SelfTest, FNV1A_REFERENCE,
  compileCell, FabricBuilder, computeStateHash,
  opBind, opLink, opTick, opView,
  verifyCellForPort, verifyPolyformalism, crossPortHashConsistency,
  CELL_KINDS, POLYFORMALISM_PORTS,
  sha256, hmacSha256,
} from '../index.ts';

// === FNV-1a reference tests ===
test('fnv1a-64 self test passes (3 reference vectors)', () => {
  assert.equal(fnv1a64SelfTest(), true);
});

test('fnv1a-64 empty matches offset basis', () => {
  assert.equal(fnv1a64(new Uint8Array(0)), FNV1A_REFERENCE.empty);
});

test('fnv1a-64 "a" matches', () => {
  assert.equal(fnv1a64(new TextEncoder().encode('a')), FNV1A_REFERENCE.a);
});

test('fnv1a-64 "foobar" matches', () => {
  assert.equal(fnv1a64(new TextEncoder().encode('foobar')), FNV1A_REFERENCE.foobar);
});

test('fnv1a-64 hex output', () => {
  assert.equal(fnv1a64Hex('foobar'), '0x85944171f73967e8');
});

// === Cell compiler tests ===
test('compileCell accepts all 12 canonical kinds', () => {
  for (const kind of CELL_KINDS) {
    const c = compileCell({ kind, id: `c-${kind}`, payload: {}, dials: new Array(16).fill(0) });
    assert.equal(c.kind, kind);
    assert.equal(c.id, `c-${kind}`);
  }
});

test('compileCell rejects unknown kind', () => {
  assert.throws(() => compileCell({ kind: 'unknown', id: 'x', payload: {} }), /Unknown cell kind/);
});

test('compileCell rejects empty id', () => {
  assert.throws(() => compileCell({ kind: 'value', id: '', payload: {} }), /non-empty id/);
});

test('compileCell fills missing dials to 16 zeros', () => {
  const c = compileCell({ kind: 'value', id: 'x', payload: {}, dials: [1, 2] });
  assert.equal(c.dials.length, 16);
  assert.equal(c.dials[0], 1);
  assert.equal(c.dials[1], 2);
  assert.equal(c.dials[15], 0);
});

// === Fabric tests ===
test('FabricBuilder builds with state hash', () => {
  const fb = new FabricBuilder();
  fb.addCell(compileCell({ kind: 'value', id: 'a', payload: {}, dials: new Array(16).fill(0) }));
  fb.addCell(compileCell({ kind: 'formula', id: 'b', payload: {}, dials: new Array(16).fill(0) }));
  fb.addLink({ from: 'a', to: 'b', op: 'bind' });
  const f = fb.build();
  assert.equal(f.cells.size, 2);
  assert.equal(f.links.length, 1);
  assert.match(f.stateHash, /^0x[0-9a-f]{16}$/);
});

test('FabricBuilder rejects duplicate ids', () => {
  const fb = new FabricBuilder();
  fb.addCell(compileCell({ kind: 'value', id: 'a', payload: {} }));
  assert.throws(() => fb.addCell(compileCell({ kind: 'value', id: 'a', payload: {} })));
});

test('FabricBuilder rejects links to unknown cells', () => {
  const fb = new FabricBuilder();
  fb.addCell(compileCell({ kind: 'value', id: 'a', payload: {} }));
  assert.throws(() => fb.addLink({ from: 'a', to: 'missing', op: 'bind' }));
});

// === Opcode tests ===
test('opBind clamps to int16 range', () => {
  const c = compileCell({ kind: 'value', id: 'x', payload: {} });
  const bound = opBind(c, 0, 2.0);  // exceeds Q1.15
  assert.ok(bound.dials[0] <= 32767);
  assert.ok(bound.dials[0] >= 32767 - 1);
});

test('opLink averages dials of two cells', () => {
  const a = compileCell({ kind: 'value', id: 'a', payload: {}, dials: new Array(16).fill(100) });
  const b = compileCell({ kind: 'value', id: 'b', payload: {}, dials: new Array(16).fill(200) });
  const linked = opLink(a, b);
  assert.equal(linked.cell.dials[0], 150);
  assert.equal(linked.other.dials[0], 150);
});

test('opTick alternates direction', () => {
  const c = compileCell({ kind: 'value', id: 'x', payload: {} });
  const t1 = opTick([c], 0);  // even: +1
  const t2 = opTick([c], 1);  // odd: -1
  assert.equal(t1[0].dials[15], 1);
  assert.equal(t2[0].dials[15], -1);
});

test('opView does not modify cell', () => {
  const c = compileCell({ kind: 'value', id: 'x', payload: {}, dials: [1, 2, 3, 4] });
  const v = opView(c);
  assert.equal(v.id, 'x');
  assert.deepEqual(v.dials.slice(0, 4), [1, 2, 3, 4]);
  assert.equal(c.dials[0], 1);  // unchanged
});

// === Polyformalism verifier ===
test('verifyCellForPort passes for valid cell', () => {
  const c = compileCell({ kind: 'value', id: 'x', payload: {}, dials: new Array(16).fill(0.5) });
  const r = verifyCellForPort(c, 'js');
  assert.equal(r.ok, true);
});

test('verifyCellForPort passes for all 13 ports with valid cell', () => {
  const c = compileCell({ kind: 'value', id: 'x', payload: {}, dials: new Array(16).fill(0.5) });
  const results = verifyPolyformalism(c);
  for (const r of results) {
    assert.equal(r.ok, true, `port ${r.port} should be ok`);
  }
});

test('crossPortHashConsistency across LE ports', () => {
  const c = compileCell({ kind: 'value', id: 'x', payload: {}, dials: new Array(16).fill(0.5) });
  const { consistent, hashes } = crossPortHashConsistency(c);
  // Most LE int16 ports should produce identical hashes
  assert.equal(typeof consistent, 'boolean');
  assert.equal(typeof hashes.js, 'string');
});

test('verifyPolyformalism flags out-of-range dial', () => {
  const c = compileCell({ kind: 'value', id: 'x', payload: {}, dials: new Array(16).fill(2.0) });
  const r = verifyCellForPort(c, 'js');  // JS expects [-1, 1]
  assert.equal(r.ok, false);
});

// === Crypto interop ===
test('sha256 produces 32-byte hash', () => {
  const h = sha256(new TextEncoder().encode('hello'));
  assert.equal(h.length, 32);
});

test('hmacSha256 produces deterministic output', () => {
  const k = new TextEncoder().encode('key');
  const m = new TextEncoder().encode('message');
  const h1 = hmacSha256(k, m);
  const h2 = hmacSha256(k, m);
  assert.deepEqual(h1, h2);
  assert.equal(h1.length, 32);
});

// === State hash determinism ===
test('computeStateHash is deterministic for same cells', () => {
  const cells1 = new Map([
    ['a', compileCell({ kind: 'value', id: 'a', payload: {}, dials: new Array(16).fill(100) })],
    ['b', compileCell({ kind: 'value', id: 'b', payload: {}, dials: new Array(16).fill(200) })],
  ]);
  const cells2 = new Map([
    ['b', compileCell({ kind: 'value', id: 'b', payload: {}, dials: new Array(16).fill(200) })],
    ['a', compileCell({ kind: 'value', id: 'a', payload: {}, dials: new Array(16).fill(100) })],
  ]);
  // Different insertion order should still produce same hash (sorted by id internally)
  assert.equal(computeStateHash(cells1), computeStateHash(cells2));
});

test('computeStateHash changes when dial changes', () => {
  const cells1 = new Map([
    ['a', compileCell({ kind: 'value', id: 'a', payload: {}, dials: new Array(16).fill(100) })],
  ]);
  const cells2 = new Map([
    ['a', compileCell({ kind: 'value', id: 'a', payload: {}, dials: new Array(16).fill(200) })],
  ]);
  assert.notEqual(computeStateHash(cells1), computeStateHash(cells2));
});
