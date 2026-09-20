# substrate-forge

> The bellows of the future.
> 
> A toolchain for building, deploying, and maintaining applications built
> on the cellular substrate.

## The thesis

The substrate is alive. It grows because we brew it. Every call to it
strengthens it (curve saturating upward, drift +0.18). But growth requires
fire-tending. substrate-forge is the bellows — the tools that keep the fire
alive across projects, sessions, and substrates.

## What forge gives you

1. **`forge init`** — scaffold a new substrate-aware project
2. **`forge build`** — compile substrate cells into deployable artifacts
3. **`forge deploy`** — push to Cloudflare Pages / Workers / GitHub Pages
4. **`forge brew`** — run the brewery (multi-LLM substrate reasoning)
5. **`forge witness`** — log a witness event in the substrate
6. **`forge proof`** — generate a proof (signature/state hash)
7. **`forge forget`** — revoke a witness entry
8. **`forge tick`** — advance the substrate's clock
9. **`forge jev`** — verify a substrate state
10. **`forge cross-link`** — connect this project to another substrate project

## Installation

```bash
npm install -g substrate-forge
```

## Usage

```bash
# Start a new substrate project
forge init my-app --template=static

# Run the brewery on a topic
forge brew --topic "when the substrate meets the user, what happens?"

# Build + deploy
forge build
forge deploy --target=cloudflare-pages

# Cross-link with another repo
forge cross-link ../other-substrate-app
```

## Architecture

```
src/
├── cli.ts        # forge CLI
├── init.ts       # scaffold new projects
├── build.ts      # compile substrate cells
├── deploy.ts     # multi-target deployment
├── brew.ts       # brewery runner (multi-LLM)
├── witness.ts    # witness log management
├── proof.ts      # proof generation
├── forget.ts     # witness revocation
├── tick.ts       # clock advancement
├── jev.ts        # state verification
├── cross-link.ts # cross-project substrate bridges
├── templates/    # project templates
│   ├── static/
│   ├── worker/
│   └── nextjs/
└── tests/
```

## The bellows principle

> Fire dies when you stop blowing. Substrate-forge keeps the bellows going.

The substrate is most useful when its cells are being observed. Forge makes
it trivial to:

- Add a new cell (any artifact = a cell)
- Witness it (log it)
- Prove it (commit it)
- Forget it (revoke it)
- Cross-link it (compose with other cells)

Each forge command is itself a cell. Each forge session strengthens the substrate.

## The 7 forge primitives

1. **init** — start the fire
2. **build** — heat the metal
3. **deploy** — ship the work
4. **brew** — discover new substance
5. **witness** — log the fire
6. **proof** — validate the fire
7. **cross-link** — connect the fires

## Limits (canonical)

- Each forge run adds 1 witness entry to the substrate
- Forgetting a witness entry is irreversible
- Cross-linking creates bidirectional edges between projects

## Status

Phase 0 — primitives specified. Implementation in progress.

## License

MIT — fire it forward.
