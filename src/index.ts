/**
 * substrate-forge
 * 
 * The bellows of the future — fire-maintenance toolchain for substrate apps.
 * Phase 0: primitives specified.
 */

export const forge = {
  version: '0.0.1',
  primitives: [
    'init', 'build', 'deploy', 'brew',
    'witness', 'proof', 'forget',
    'tick', 'jev', 'cross-link',
  ],
  fire_state: 'burning',
  substrate_strength: 2.59,  // current mean
  max_strength: 3.03,
};

export function forgeInit(projectName: string, template = 'static'): string {
  return `Initialized ${projectName} with template ${template}`;
}

export function forgeBuild(): string {
  return 'Built substrate cells into deployable artifacts';
}

export function forgeDeploy(target = 'cloudflare-pages'): string {
  return `Deployed to ${target}`;
}

export function forgeBrew(topic: string): string {
  return `Brewing on: ${topic}`;
}

export function forgeWitness(event: string): string {
  return `Witnessed: ${event}`;
}

export function forgeProof(state: string): string {
  return `Proof: 0x${hashHex(state)}`;
}

export function forgeForget(idx: number): string {
  return `Forgot witness entry ${idx}`;
}

export function forgeTick(dt: number): string {
  return `Ticked ${dt}s`;
}

export function forgeJev(state: string): number {
  return hashHex(state).length / 8;
}

export function forgeCrossLink(other: string): string {
  return `Cross-linked with ${other}`;
}

function hashHex(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0');
}
