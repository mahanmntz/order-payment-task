# Order & Payment API

Node.js + TypeScript + Express 5 + MongoDB (Mongoose) + Zod. بدون وابستگی اضافه برای JWT (با `crypto` خود Node پیاده شده).

## اجرا

```bash
npm install
npm run db      # ترمینال ۱: MongoDB لوکال روی 27017 (یا هر MongoDB دیگری؛ MONGO_URI را ست کنید)
npm run dev     # ترمینال ۲: سرور + seed داده‌های dev  → http://localhost:3000  (UI همین‌جاست)
npm test        # تست‌ها (MongoDB in-memory جدا می‌سازند، به db بالا دست نمی‌زنند)
```

متغیرهای محیطی (`.env.example`): `MONGO_URI`, `PORT`, `JWT_SECRET`, `CALLBACK_SECRET`.
در حالت `NODE_ENV=production` دو secret اجباری‌اند و seed اجرا نمی‌شود.

کاربران seed (فقط dev): `admin@example.com / admin123`، `user1@example.com / user123`، `user2@example.com / user123`.

## API

| Method | Path | Auth | توضیح |
|---|---|---|---|
| POST | `/auth/login` | – | `{email,password}` → JWT |
| GET | `/products`, `/products/:id` | – | |
| POST / PATCH | `/products`, `/products/:id` | admin | |
| POST | `/orders` | user | `{items:[{productId,quantity}]}` |
| GET | `/orders`, `/orders/:id` | user | فقط سفارش‌های خود کاربر |
| POST | `/orders/:id/cancel` | user | تنها تغییر وضعیت دست کلاینت (`Pending→Cancelled`) |
| POST | `/payments` | user | هدر `Idempotency-Key` + `{orderId, amount}` |
| POST | `/payments/callback` | هدر `x-callback-secret` | از طرف provider فرضی |

خطاها همیشه `{ "success": false, "message": "...", "code": "..." }` هستند؛ stack trace هرگز برنمی‌گردد (فقط در لاگ سرور).

## تصمیم‌های طراحی

### ۱. Race condition (stock = 1)
هر آیتم سفارش با **یک query اتمیک** رزرو می‌شود:
```ts
Product.findOneAndUpdate({ _id, isActive: true, stock: { $gte: qty } }, { $inc: { stock: -qty } })
```
شرط و کاهش در یک عملیات روی یک document انجام می‌شود (MongoDB روی یک document قفل می‌گیرد)، پس دو درخواست همزمان نمی‌توانند هر دو موفق شوند؛ دومی `null` می‌گیرد → `409 INSUFFICIENT_STOCK`. الگوی «اول بخوان، بعد بنویس» (read-then-write) عمداً استفاده نشده چون race دارد.

اگر سفارش چند آیتم داشته باشد و آیتم دوم شکست بخورد، آیتم‌های قبلی جبران (`releaseStock`) می‌شوند.

### ۲. موجودی چه زمانی کم می‌شود؟ (انحراف آگاهانه از فلو داخل صورت تسک)
در فلو تسک، کاهش موجودی بعد از تأیید پرداخت است. من موجودی را **هنگام ساخت سفارش رزرو (کم)** می‌کنم و در `Cancel` یا `Failed` برمی‌گردانم. دلیل: اگر کم کردن بعد از پرداخت باشد، دو کاربر هر دو می‌توانند سفارش بسازند و پرداخت کنند و آخرین کالا دوبار فروخته می‌شود (یا باید بعد از گرفتن پول رد شود، که بدتر است).
**هزینه:** سفارش‌های Pending که هیچ‌وقت پرداخت نمی‌شوند موجودی را قفل می‌کنند. راه‌حل واقعی: job که سفارش‌های Pending قدیمی را کنسل کند (expiry). **پیاده نشده**؛ اینجا فقط ذکر می‌کنم.

### ۳. Idempotency
- `POST /payments`: ایندکس unique روی `(userId, idempotencyKey)`. درخواست تکراری همان Payment را با هدر `Idempotent-Replayed` برمی‌گرداند. اگر دو درخواست همزمان با یک کلید بیایند، یکی با خطای `E11000` رد می‌شود و آن را به replay تبدیل می‌کنیم. همان کلید با `orderId` دیگر → `422`.
- اضافه بر آن، ایندکس unique جزئی (`partialFilterExpression: status=Pending`) روی `orderId` اجازه نمی‌دهد برای یک سفارش دو پرداخت **در جریان** با کلیدهای متفاوت باز شود.
- `POST /payments/callback`: خود تغییر وضعیت شرطی است: `findOneAndUpdate({_id, status:'Pending'}, …)`. فقط اولین callback برنده است؛ بقیه (حتی با status متفاوت) هیچ تغییری نمی‌دهند و نتیجه ثبت‌شده را برمی‌گردانند. تغییر سفارش هم شرطی روی `Pending` است، پس Paid دوبار نمی‌شود و موجودی دوبار برنمی‌گردد.

### ۴. Price / Amount tampering
- Zod با `.strict()` هر فیلد اضافه (مثل `price`) را رد می‌کند؛ قیمت از DB خوانده و در Order **snapshot** می‌شود، و `total` سمت سرور حساب می‌شود.
- `amount` در `POST /payments` فقط یک **چک** است: با `order.total` مقایسه می‌شود، نابرابر → `400 AMOUNT_MISMATCH`. مبلغ ذخیره‌شده همیشه از Order است. callback هم `amount` را با Payment مقایسه می‌کند.
- پول به صورت عدد صحیح (کوچک‌ترین واحد) نگه‌داری می‌شود، نه float.

### ۵. State machine
`Pending → Paid | Failed` فقط از callback؛ `Pending → Cancelled` فقط از endpoint cancel. endpoint عمومی برای تغییر status وجود ندارد. هر انتقال یک `findOneAndUpdate` با شرط `status: 'Pending'` است (اتمیک).

### ۶. Auth و Security
- JWT (HS256، انقضا ۱ ساعت)، رمز با `scrypt` + salt. پیام خطای login برای ایمیل اشتباه و رمز اشتباه یکسان است.
- هر کاربر فقط سفارش/پرداخت خودش را می‌بیند؛ سفارش دیگران `404` می‌دهد (نه 403) تا وجودش لو نرود.
- callback با secret مشترک و مقایسه timing-safe محافظت می‌شود. (در واقعیت: امضای HMAC روی body + timestamp.)
- `OrderItem` به صورت embedded داخل Order است (همیشه با Order خوانده/نوشته می‌شود و جدا کوئری نمی‌شود).

## Indexها

| Collection | Index | چرا / کدام query |
|---|---|---|
| users | `email` unique | `POST /auth/login` (`findOne({email})`) و جلوگیری از ایمیل تکراری |
| products | `createdAt: -1` | `GET /products` (sort جدیدترین) |
| orders | `{userId: 1, createdAt: -1}` | `GET /orders` (سفارش‌های من، مرتب‌شده). پیشوند `userId` فیلتر مالکیت `GET /orders/:id` را هم پوشش می‌دهد |
| payments | `{userId, idempotencyKey}` unique | idempotency؛ lookup در replay و تضمین یکتایی |
| payments | `{orderId}` unique + partial (`status=Pending`) | یک پرداخت در جریان برای هر سفارش |
| همه | `_id` (خودکار) | `findById` در callback و GET تکی |

**اگر ایندکس زیاد شود؟** هر ایندکس باید روی هر insert/update/delete به‌روز شود (write کندتر)، RAM (working set) و دیسک مصرف می‌کند، و بهینه‌ساز query ممکن است بین چند ایندکس مشابه گیج شود. برای همین فقط ایندکس‌هایی ساخته شده که یک query واقعی یا یک constraint یکتایی پشتشان است (مثلاً ایندکس `status` را عمداً نساختم چون هیچ query روی آن نداریم). بررسی با `explain()` و حذف ایندکس‌های بلااستفاده توصیه می‌شود.

## محدودیت‌ها (صادقانه)
- بدون transaction: چون replica set لازم است، از جبران دستی استفاده شد. اگر پروسه دقیقاً بین «Order→Failed» و «برگرداندن موجودی» کرش کند، موجودی نشت می‌کند. با transaction (replica set) این پنجره بسته می‌شود.
- expiry سفارش‌های Pending، refresh token، rate limiting، و refund (پرداخت موفق برای سفارش کنسل‌شده) پیاده نشده‌اند.
- UI (`public/index.html`) فقط playground برای تست است، نه محصول.
# order-payment-task
