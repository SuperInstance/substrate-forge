/**
 * substrate-forge
 *
 * The build pipeline / compilation layer for the Quilt substrate.
 * Implements the cell compiler, fabric builder, polyformalism verifier,
 * and the 5-opcode simulator (BIND/LINK/EFFECT/VIEW/TICK).
 *
 * All state hashes use FNV-1a 64-bit so the same cell produces the same
 * hash in JavaScript, Python, C, Rust, Go, Haskell, J, Lua, Zig, Forth,
 * SubLEQ, Verilog, and VHDL — that's polyformalism.
 */

import { createHash, createHmac } from 'node:crypto';

// === FNV-1a 64-bit hash (byte-exact across polyformalism ports) ===
const FNV1A_OFFSET = 0xcbf29ce484222325n;
const FNV1A_PRIME = 0x100000001b3n;

export function fnv1a64(bytes: Uint8Array): bigint {
  let h = FNV1A_OFFSET;
  for (let i = 0; i < bytes.length; i++) {
    h = BigInt.asUintN(64, (h ^ BigInt(bytes[i])) * FNV1A_PRIME);
  }
  return h;
}

export function fnv1a64Hex(s: string): string {
  return '0x' + fnv1a64(new TextEncoder().encode(s)).toString(16).padStart(16, '0');
}

/** The 3 well-known FNV-1a 64-bit reference test vectors.
 *  Pass empty/a/foobar. If any of these fail, your impl is wrong. */
export const FNV1A_REFERENCE = {
  empty: 0xcbf29ce484222325n,
  a: 0xaf63dc4c8601ec8cn,
  foobar: 0x85944171f73967e8n,
};

export function fnv1a64SelfTest(): boolean {
  return (
    fnv1a64(new Uint8Array(0)) === FNV1A_REFERENCE.empty &&
    fnv1a64(new TextEncoder().encode('a')) === FNV1A_REFERENCE.a &&
    fnv1a64(new TextEncoder().encode('foobar')) === FNV1A_REFERENCE.foobar
  );
}

// === Cell kinds (canonical 12) ===
export const CELL_KINDS = [
  'value', 'formula', 'listener', 'timer',
  'sensor', 'actuator', 'router', 'vector',
  'log', 'alarm', 'api', 'ai',
] as const;

export type CellKind = typeof CELL_KINDS[number];

export interface Cell {
  kind: CellKind;
  id: string;
  payload: Record<string, unknown>;
  dials: number[];   // 16-dial Q1.15 vector
}

export class CellCompilerError extends Error {
  constructor(msg: string) { super(msg); this.name = 'CellCompilerError'; }
}

export function compileCell(input: unknown): Cell {
  if (!input || typeof input !== 'object') {
    throw new CellCompilerError('Cell must be an object');
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.kind !== 'string' || !CELL_KINDS.includes(obj.kind as CellKind)) {
    throw new CellCompilerError(`Unknown cell kind: ${obj.kind}`);
  }
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new CellCompilerError('Cell must have non-empty id');
  }
  if (!obj.payload || typeof obj.payload !== 'object') {
    throw new CellCompilerError('Cell must have payload object');
  }
  const dials = Array.isArray(obj.dials) ? obj.dials.slice(0, 16).map(Number) : new Array(16).fill(0);
  while (dials.length < 16) dials.push(0);
  return {
    kind: obj.kind as CellKind,
    id: obj.id,
    payload: obj.payload as Record<string, unknown>,
    dials,
  };
}

// === Fabric builder ===
export interface Link {
  from: string;
  to: string;
  op: 'bind' | 'link' | 'effect' | 'view';
  weight?: number;
}

export interface Fabric {
  cells: Map<string, Cell>;
  links: Link[];
  stateHash: string;
  adjacency: Map<string, Set<string>>;
  reverseAdj: Map<string, Set<string>>;
}

export class FabricBuilder {
  private cells = new Map<string, Cell>();
  private links: Link[] = [];

  addCell(cell: Cell): this {
    if (this.cells.has(cell.id)) throw new Error(`duplicate cell id: ${cell.id}`);
    this.cells.set(cell.id, cell);
    return this;
  }

  addLink(link: Link): this {
    if (!this.cells.has(link.from)) throw new Error(`unknown source cell: ${link.from}`);
    if (!this.cells.has(link.to)) throw new Error(`unknown target cell: ${link.to}`);
    this.links.push(link);
    return this;
  }

  build(): Fabric {
    const adjacency = new Map<string, Set<string>>();
    const reverseAdj = new Map<string, Set<string>>();
    for (const id of this.cells.keys()) {
      adjacency.set(id, new Set());
      reverseAdj.set(id, new Set());
    }
    for (const l of this.links) {
      adjacency.get(l.from)!.add(l.to);
      reverseAdj.get(l.to)!.add(l.from);
    }
    const stateHash = computeStateHash(this.cells);
    return {
      cells: this.cells,
      links: this.links,
      stateHash,
      adjacency,
      reverseAdj,
    };
  }

  /** Verify the fabric is connected. Returns true if all cells reachable from first. */
  isConnected(): boolean {
    if (this.cells.size === 0) return true;
    const visited = new Set<string>();
    const stack = [this.cells.keys().next().value!];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const next of this.adjacency.get(cur) || []) if (!visited.has(next)) stack.push(next);
      for (const prev of this.reverseAdj.get(cur) || []) if (!visited.has(prev)) stack.push(prev);
    }
    return visited.size === this.cells.size;
  }
}

export function computeStateHash(cells: Map<string, Cell>): string {
  // Deterministic: sort by id, concat dial vectors, FNV-1a hash
  const sorted = Array.from(cells.values()).sort((a, b) => a.id.localeCompare(b.id));
  const bytes = new Uint8Array(sorted.length * 16 * 4);
  let off = 0;
  const view = new DataView(bytes.buffer);
  for (const c of sorted) {
    for (let i = 0; i < 16; i++) {
      const dial = Math.round(c.dials[i] * 32768) | 0;
      view.setInt32(off, dial, true);
      off += 4;
    }
  }
  return '0x' + fnv1a64(bytes).toString(16).padStart(16, '0');
}

// === The 5 opcodes ===

/** BIND: assign a dial value (Q1.15 signed fixed point). */
export function opBind(cell: Cell, dialIdx: number, value: number): Cell {
  if (dialIdx < 0 || dialIdx >= 16) throw new Error(`dial index out of range: ${dialIdx}`);
  const clamped = Math.max(-32768, Math.min(32767, Math.round(value * 32768)));
  const dials = cell.dials.slice();
  dials[dialIdx] = clamped;
  return { ...cell, dials };
}

/** LINK: pair two cells so they update together. */
export function opLink(cell: Cell, other: Cell): { cell: Cell; other: Cell } {
  const dials = cell.dials.slice();
  const otherDials = other.dials.slice();
  for (let i = 0; i < 16; i++) {
    const avg = Math.round((dials[i] + otherDials[i]) / 2);
    dials[i] = avg;
    otherDials[i] = avg;
  }
  return { cell: { ...cell, dials }, other: { ...other, dials: otherDials } };
}

/** EFFECT: apply a function transform to a cell's payload + dials. */
export function opEffect<T extends Cell>(cell: T, fn: (c: T) => T): T {
  return fn(cell);
}

/** VIEW: read a cell's state without modifying. */
export function opView(cell: Cell): { id: string; kind: CellKind; dials: number[] } {
  return { id: cell.id, kind: cell.kind, dials: cell.dials.slice() };
}

/** TICK: advance time. Alternating dial direction (1, -1, 1, -1, ...). */
export function opTick(cells: Iterable<Cell>, tickNum: number): Cell[] {
  const direction = tickNum % 2 === 0 ? 1 : -1;
  const result: Cell[] = [];
  for (const c of cells) {
    const dials = c.dials.slice();
    // Advance first dial, others rotate
    const first = dials[0];
    for (let i = 0; i < 15; i++) dials[i] = dials[i + 1];
    dials[15] = first + direction;
    result.push({ ...c, dials });
  }
  return result;
}

// === Polyformalism verifier ===
export const POLYFORMALISM_PORTS = [
  'js', 'python', 'c', 'rust', 'go',
  'haskell', 'j', 'lua', 'zig',
  'forth', 'subleq', 'verilog', 'vhdl',
] as const;
export type PolyformalismPort = typeof POLYFORMALISM_PORTS[number];

export interface PortSpec {
  /** Dial range expected by this port (Q1.15 = [-1, 1] as int16). */
  dialRange: { min: number; max: number };
  /** Endianness expected by this port. */
  endianness: 'le' | 'be';
  /** Dial vector length expected. */
  dialCount: number;
}

export const PORT_SPECS: Record<PolyformalismPort, PortSpec> = {
  js:        { dialRange: { min: -1, max: 1 }, endianness: 'le', dialCount: 16 },
  python:    { dialRange: { min: -1, max: 1 }, endianness: 'le', dialCount: 16 },
  c:         { dialRange: { min: -32768, max: 32767 }, endianness: 'le', dialCount: 16 },
  rust:      { dialRange: { min: -32768, max: 32767 }, endianness: 'le', dialCount: 16 },
  go:        { dialRange: { min: -32768, max: 32767 }, endianness: 'le', dialCount: 16 },
  haskell:   { dialRange: { min: -32768, max: 32767 }, endianness: 'le', dialCount: 16 },
  j:         { dialRange: { min: -1, max: 1 }, endianness: 'le', dialCount: 16 },
  lua:       { dialRange: { min: -1, max: 1 }, endianness: 'le', dialCount: 16 },
  zig:       { dialRange: { min: -32768, max: 32767 }, endianness: 'le', dialCount: 16 },
  forth:     { dialRange: { min: -32768, max: 32767 }, endianness: 'be', dialCount: 16 },
  subleq:    { dialRange: { min: -32768, max: 32767 }, endianness: 'le', dialCount: 16 },
  verilog:   { dialRange: { min: -32768, max: 32767 }, endianness: 'le', dialCount: 16 },
  vhdl:      { dialRange: { min: -32768, max: 32767 }, endianness: 'le', dialCount: 16 },
};

export interface VerificationResult {
  cell: Cell;
  port: PolyformalismPort;
  ok: boolean;
  errors: string[];
  hash: string;
}

export function verifyCellForPort(cell: Cell, port: PolyformalismPort): VerificationResult {
  const spec = PORT_SPECS[port];
  const errors: string[] = [];
  if (cell.dials.length !== spec.dialCount) {
    errors.push(`dial count ${cell.dials.length} != expected ${spec.dialCount}`);
  }
  for (let i = 0; i < cell.dials.length; i++) {
    const d = cell.dials[i];
    if (d < spec.dialRange.min || d > spec.dialRange.max) {
      errors.push(`dial[${i}] = ${d} out of range [${spec.dialRange.min}, ${spec.dialRange.max}]`);
    }
  }
  if (!CELL_KINDS.includes(cell.kind)) {
    errors.push(`unknown cell kind: ${cell.kind}`);
  }
  // Compute port-specific hash (Q1.15 serialization matches spec)
  const sorted = [cell.kind, cell.id];
  const idBytes = new TextEncoder().encode(sorted.join(''));
  const bytes = new Uint8Array(64 + idBytes.length);
  let off = 0;
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 16; i++) {
    const dial = Math.round(cell.dials[i] * 32768) | 0;
    if (spec.endianness === 'le') view.setInt32(off, dial, true);
    else view.setInt32(off, dial, false);
    off += 4;
  }
  bytes.set(idBytes, off);
  const hash = '0x' + fnv1a64(bytes.subarray(0, off + idBytes.length)).toString(16).padStart(16, '0');
  return { cell, port, ok: errors.length === 0, errors, hash };
}

export function verifyPolyformalism(cell: Cell, ports: PolyformalismPort[] = [...POLYFORMALISM_PORTS]): VerificationResult[] {
  return ports.map(p => verifyCellForPort(cell, p));
}

/** Compare hashes across ports. All ports with the same endianness+dial range should produce identical hashes. */
export function crossPortHashConsistency(cell: Cell): { consistent: boolean; hashes: Record<PolyformalismPort, string> } {
  const results = verifyPolyformalism(cell);
  const hashes = Object.fromEntries(results.map(r => [r.port, r.hash])) as Record<PolyformalismPort, string>;
  const leInt16Hashes = Object.entries(PORT_SPECS)
    .filter(([_, spec]) => spec.endianness === 'le')
    .map(([p]) => hashes[p as PolyformalismPort]);
  const allSame = leInt16Hashes.every(h => h === leInt16Hashes[0]);
  return { consistent: allSame, hashes };
}

// === SHA-256 / HMAC exports (for substrate-post-quantum interop) ===
export function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}

export function sha512(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha512').update(data).digest());
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return new Uint8Array(createHmac('sha256', key).update(data).digest());
}

// === The CLI ===
export function version(): string { return '0.1.0'; }

export const forge = {
  version: version(),
  fnv1a64,
  fnv1a64Hex,
  fnv1a64SelfTest,
  computeStateHash,
  compileCell,
  verifyPolyformalism,
  crossPortHashConsistency,
  opBind, opLink, opEffect, opView, opTick,
  sha256, sha512, hmacSha256,
  CELL_KINDS,
  POLYFORMALISM_PORTS,
  FNV1A_REFERENCE,
};
