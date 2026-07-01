# TypeScript Style

## Type Ownership

- Colocate types with the module, feature, or domain that owns them.
- Avoid broad `types.ts` files that collect unrelated shapes from across the codebase.
- Use shared type modules only for genuinely shared contracts.
- Keep DTOs, command/query payloads, and cross-boundary contracts close to the boundary they describe.

## Inference And Contracts

- Let TypeScript infer local values, private helper returns, and obvious generics when readability and strictness remain intact.
- Use explicit types for public APIs, exported functions, serialized data, cross-process boundaries, and places where inference would hide an important contract.
- Avoid redundant annotations that repeat the right-hand side without adding safety or documentation.
- Prefer precise domain types over loose bags of optional fields.

## Module Shape

- Keep modules focused on one responsibility: parsing, domain logic, IO adapters, UI view models, or tests.
- Prefer named helpers over large procedural functions when branches or transformations become hard to scan.
- Keep validation and parsing at system boundaries. Keep inner functions working with already-normalized data where practical.
- Avoid exporting implementation details just to make tests easy; test through public behavior unless a pure helper is valuable in its own right.
