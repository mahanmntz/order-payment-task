# Order & Payment API

Node.js, TypeScript, Express 5, MongoDB (Mongoose), Zod, JWT. A small Next.js UI and a mock payment page are included for trying it out.

## Run

```bash
npm install && npm --prefix web install
npm run db      # MongoDB on :27017 (or set MONGO_URI to your own)
npm run dev     # API on :3000, seeds dev data
npm run web     # UI on :3001
```

Seeded users: `admin@example.com / admin123`, `user1@example.com / user123`, `user2@example.com / user123`.
`npm run reset` deletes all orders and payments and restores the seeded products (dev only).
Env (`.env.example`): `MONGO_URI`, `PORT`, `JWT_SECRET`, `CALLBACK_SECRET`. Both secrets are required when `NODE_ENV=production`.

## Tests

`npm test` runs 9 tests against an in-memory MongoDB (it never touches your dev data) and prints one line per test:

| # | Test |
|---|---|
| 1 | creates an order successfully |
| 2 | rejects an unavailable product |
| 3 | rejects insufficient stock and rolls back partial reservations |
| 4 | a price change after the order does not affect the order |
| 5 | a successful payment marks the order Paid |
| 6 | duplicate callbacks neither pay twice nor change stock twice |
| 7 | a repeated Idempotency-Key does not create a second payment |
| 8 | rejects a payment with the wrong amount |
| 9 | two concurrent requests for the last item: only one succeeds |

To see the same behavior against the running API, use `npm run demo` (curl walkthrough with expected results). The API terminal logs one line per request and business event.

## API

| | Path | Auth |
|---|---|---|
| POST | `/auth/login` | - |
| GET | `/products?q=`, `/products/:id` | - |
| POST, PATCH | `/products`, `/products/:id` | admin |
| POST, GET | `/orders`, `/orders/:id`, `GET /orders` | user (own orders only) |
| POST | `/orders/:id/cancel` | user |
| POST, GET | `/payments`, `/payments/:id` | user |
| POST | `/payments/callback` | `x-callback-secret` header |

Errors are always `{ "success": false, "message": "...", "code": "..." }`. Stack traces go to the server log only.

## Structure

A modular monolith. Each module owns its data and exposes a small API through its `index.ts`.

```
src/modules/  users  auth  products  orders  payments
src/shared/   errors (central handler), logger, validation
web/          Next.js UI + mock payment provider
```

`products` is the only code that changes `stock`, and `orders` is the only code that changes an order's `status`. Routes parse input, services hold the rules.

## Design decisions

**Race condition.** Stock is reserved with one atomic query:
`findOneAndUpdate({ _id, isActive: true, stock: { $gte: qty } }, { $inc: { stock: -qty } })`.
Check and decrement happen in a single operation, so two buyers of the last item cannot both succeed. Read-then-write would leave a race window. If a later line of a multi-item order fails, earlier lines are released.

**When stock is deducted (differs from the task's flow).** The task deducts after payment is confirmed. I reserve at order creation and return the stock on `Cancelled` or `Failed`. Otherwise two users could both create an order and both pay for the last item. Cost: unpaid `Pending` orders hold stock, and an expiry job for them is not implemented.

**Idempotency.**
- `POST /payments`: unique index on `(userId, idempotencyKey)`. A repeat returns the same payment (`200`, `Idempotent-Replayed: true`). If two identical requests race, one gets `E11000` and becomes a replay, so the index decides, not a pre-check. The same key for another order returns `422`.
- A partial unique index on `orderId` (only while `Pending`) allows one in-flight payment per order, even under different keys (`409`).
- `POST /payments/callback`: `findOneAndUpdate({ _id, status: 'Pending' }, ...)` means the first callback wins. Duplicates and conflicting callbacks return `200` and change nothing (providers retry until they get a 2xx). The order moves `Pending -> Paid | Failed` with the same conditional update, and stock is returned only by the update that actually changed the order, so it cannot happen twice.

**Price and amount tampering.** Zod `.strict()` rejects unknown fields such as `price`. Prices are read from the database and snapshotted into the order, and the server computes the total. The `amount` sent to `/payments` is only a check against `order.total` (`400 AMOUNT_MISMATCH`); the stored amount always comes from the order. The callback also checks its amount. Money is an integer, never a float.

**Order state machine.** `Pending -> Paid | Failed` only through the provider callback, `Pending -> Cancelled` only through cancel. No endpoint accepts a status. Every transition is one conditional `findOneAndUpdate`.

**Validation and errors.** Zod on every input (ids, `quantity >= 1`, `amount >= 0`, required header). One error handler maps `AppError`, validation and unknown errors to the same response shape, and unknown errors are logged server-side and returned as a generic `500`.

**Security.** JWT (HS256, 1 hour) built on Node's `crypto`, passwords hashed with `scrypt` and a salt, one error message for unknown email and wrong password. Users only see their own orders and payments; someone else's id returns `404`. The callback is protected by a shared secret compared in constant time. In the UI the secret lives only on the Next server.

## Database indexes

| Collection | Index | Why / query |
|---|---|---|
| users | `email` unique | login lookup, no duplicate accounts |
| products | `createdAt: -1` | `GET /products` newest first |
| orders | `{ userId, createdAt: -1 }` | `GET /orders` (my orders, sorted); the `userId` prefix also serves the ownership filter of `GET /orders/:id` |
| payments | `{ userId, idempotencyKey }` unique | idempotency lookup and guarantee |
| payments | `{ orderId }` unique, partial (`Pending`) | one in-flight payment per order |
| all | `_id` | `findById` |

Too many indexes make every insert, update and delete slower, use RAM and disk, and give the query planner more to choose from. So only indexes backed by a real query or a uniqueness rule exist; for example there is no index on `orders.status` because nothing queries by it.

## Not implemented / limitations

- No transactions (they need a replica set). Multi-step changes use compensation, so a crash between "order -> Failed" and "stock returned" can leak stock.
- Pending orders never expire. No refunds (a successful payment for an already cancelled order stays `Succeeded`).
- The callback uses a shared secret, not an HMAC signature with a timestamp. Idempotency keys never expire and are not bound to the request body (same key and order with another amount returns the first payment).
- No rate limiting, refresh tokens or user registration. `PATCH /products` sets `stock` absolutely, which can overwrite concurrent reservations; a real adjustment endpoint should use `$inc`.
- `OrderItem` is embedded in `Order` instead of being its own collection: it is always read and written with the order.
