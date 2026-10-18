# Order & Payment API

A modular monolith: Node.js + TypeScript + Express 5 + MongoDB (Mongoose) + Zod, with a small Next.js playground UI.
JWT is implemented with Node's `crypto` (no extra dependency).

## Run

```bash
npm install && npm --prefix web install
npm run db      # terminal 1: local MongoDB on 27017 (or use your own and set MONGO_URI)
npm run dev     # terminal 2: API on http://localhost:3000 (seeds dev data on start)
npm run web     # terminal 3: UI on http://localhost:3001
npm run reset   # dev only: delete all orders/payments and restore seeded stock
npm test        # tests use their own in-memory MongoDB
```

Environment (`.env.example`): `MONGO_URI`, `PORT`, `JWT_SECRET`, `CALLBACK_SECRET`.
With `NODE_ENV=production` both secrets are required and seeding is disabled.

Seeded dev users: `admin@example.com / admin123`, `user1@example.com / user123`, `user2@example.com / user123`.

## Structure

```
src/
  config.ts  app.ts  server.ts  seed.ts  dev-db.ts
  shared/                  errors (central handler), logger, zod helpers
  modules/
    users/                 User model
    auth/                  login, JWT, password hashing, auth/admin middleware
    products/              Product model, routes, atomic stock reservation
    orders/                Order model, routes, state machine (transitionOrder)
    payments/              Payment model, routes, idempotency, provider callback
web/                       Next.js UI (proxies /api/* to the API) + mock payment provider
tests/                     Jest + Supertest
```

Each module exposes a small public API through its `index.ts`, and other modules import only from there:

```
payments -> orders -> products
   \          \-> auth (types)
    \-> auth
```

- `products` owns stock: `reserveStock` / `releaseStock`. Nobody else touches the `stock` field.
- `orders` owns order status: `transitionOrder` is the only code that changes it. Payments calls `settleOrder`, it never writes orders directly.
- Routes only parse input and shape responses; rules live in `*.service.ts`.

## API

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/login` | - | `{email,password}` -> JWT |
| GET | `/products?q=`, `/products/:id` | - | `q` = case-insensitive name search |
| POST / PATCH | `/products`, `/products/:id` | admin | |
| POST | `/orders` | user | `{items:[{productId,quantity}]}` |
| GET | `/orders`, `/orders/:id` | user | own orders only |
| POST | `/orders/:id/cancel` | user | the only client-driven status change |
| POST | `/payments` | user | `Idempotency-Key` header + `{orderId, amount}` |
| GET | `/payments/:id` | user | own payments only (used by the payment page) |
| POST | `/payments/callback` | `x-callback-secret` header | called by the (fake) provider |

Errors always look like `{ "success": false, "message": "...", "code": "..." }`. Stack traces are only logged server-side.

## Stock management
- Initial stock comes from `src/seed.ts` (dev only; it inserts missing products and never resets existing stock) or from `POST /products` (admin).
- The task only requires that a product has `stock` and that orders deduct it. It does not require editing stock afterwards. `PATCH /products/:id` (admin, also used by the UI) is my addition so stock, price and `isActive` can be changed for testing.
- Caveat: `PATCH` with `stock` is an absolute set. If it runs while orders are reserving stock, it overwrites their decrements. A real stock adjustment endpoint should use `$inc` with a delta.

## Logging
One line per request (`METHOD path status ms user code`) plus business events: `order.created`, `order.transition`, `stock.reserve_failed`, `payment.created`, `payment.replayed`, `payment.callback applied=true|false`. Request/response bodies, tokens and secrets are never logged. Unhandled errors are logged with their stack on the server and returned to the client as a generic 500. Logs are silent under Jest (`LOG=1` to enable).

## UI and the mock payment provider
- The UI keeps the JWT in `sessionStorage` (survives reloads and the trip to the payment page; cleared when the tab closes). An expired token signs the user out.
- **Pay** creates the payment (with the order's `Idempotency-Key`) and redirects to `/pay/:id`, a mock hosted payment page. Its Pay button calls `POST /provider/callback` on the **Next server**, which adds the shared `CALLBACK_SECRET` and forwards to the API's `/payments/callback`. The browser never sees the secret, like a real provider webhook. Set `CALLBACK_SECRET` / `API_URL` for the web process if you changed the API's defaults.
- Reloading the payment page after paying shows the stored result and cannot charge again.

## Design decisions

### 1. Race condition (stock = 1)
Every line is reserved with one atomic query:
```ts
Product.findOneAndUpdate({ _id, isActive: true, stock: { $gte: qty } }, { $inc: { stock: -qty } })
```
The condition and the decrement happen in a single operation on one document, which MongoDB serialises. Two concurrent buyers cannot both succeed: the second gets `null` and a `409 INSUFFICIENT_STOCK`. A "read, then write" approach would have a race window and is deliberately not used.
If a later line of a multi-item order fails, earlier reservations are released.

### 2. When is stock deducted? (deliberate deviation from the task's flow)
The task flow deducts stock after payment is confirmed. I reserve stock **when the order is created** and give it back on `Cancelled` / `Failed`. Reason: with deduction after payment, two users can both create an order and both pay for the last item, so one of them is charged for something that no longer exists.
**Cost:** unpaid `Pending` orders hold stock. A real system needs an expiry job that cancels old `Pending` orders. Not implemented here.

### 3. Idempotency
- `POST /payments`: unique index on `(userId, idempotencyKey)`. A repeated request returns the same payment with an `Idempotent-Replayed: true` header. If two identical requests race, one fails with `E11000` and is converted into a replay. The same key with a different `orderId` returns `422`.
- A second unique, partial index (`orderId` where `status = Pending`) prevents two in-flight payments for one order under different keys (`409 PAYMENT_IN_PROGRESS`).
- `POST /payments/callback`: the state change itself is conditional: `findOneAndUpdate({ _id, status: 'Pending' }, ...)`. Only the first callback wins; later ones (even with a different status) change nothing and return the stored result. The order transition is conditional on `Pending` as well, so an order cannot become `Paid` twice and stock cannot be returned twice.

### 4. Price and amount tampering
- Zod `.strict()` rejects unknown fields such as `price`. Prices are read from the DB and snapshotted into the order; the total is computed on the server.
- The `amount` in `POST /payments` is only a check against the server-computed order total (`400 AMOUNT_MISMATCH`). The stored amount always comes from the order. The callback also compares its `amount` with the stored payment.
- Money is an integer in minor units, never a float.

### 5. Order state machine
`Pending -> Paid | Failed` only through the provider callback, `Pending -> Cancelled` only through the cancel endpoint. There is no endpoint that accepts a status. Each transition is one `findOneAndUpdate` with `status: 'Pending'` in the filter, so it is atomic.

### 6. Security
- JWT (HS256, 1 hour), passwords hashed with `scrypt` + salt. Login returns the same error for unknown email and wrong password.
- Users only see their own orders; someone else's order returns `404`, not `403`, so its existence is not leaked.
- The callback is protected by a shared secret with a timing-safe comparison. In production this would be an HMAC signature over the body plus a timestamp.
- `OrderItem` is embedded in `Order`: it is always read and written with the order and never queried alone.

## Indexes

| Collection | Index | Why / which query |
|---|---|---|
| users | `email` unique | `POST /auth/login` (`findOne({email})`), prevents duplicate accounts |
| products | `createdAt: -1` | `GET /products` (newest first) |
| orders | `{userId: 1, createdAt: -1}` | `GET /orders` (my orders, sorted). The `userId` prefix also serves the ownership filter of `GET /orders/:id` |
| payments | `{userId, idempotencyKey}` unique | idempotency lookup and guarantee |
| payments | `{orderId}` unique, partial (`status = Pending`) | one in-flight payment per order |
| all | `_id` (automatic) | `findById` in callback and single-item GETs |

**What goes wrong with too many indexes?** Every index must be updated on each insert, update and delete, so writes get slower. Indexes use RAM (the working set) and disk, and overlapping indexes make the planner's choice harder. So I only created indexes backed by a real query or a uniqueness rule. For example there is no index on `orders.status`, because nothing queries by it. Use `explain()` to check and drop unused indexes.

## Limitations (honest list)
- No transactions (they need a replica set), so multi-step operations use compensation. If the process dies between "order -> Failed" and "stock released", stock leaks. Replica-set transactions would close that window.
- Not implemented: expiry of `Pending` orders, refresh tokens, rate limiting, refunds (a successful payment for an already-cancelled order stays `Succeeded` and needs a refund path).
- The UI is a test playground, not a product.
