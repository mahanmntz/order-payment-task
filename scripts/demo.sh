#!/usr/bin/env bash
B=${B:-http://localhost:3000}
J='content-type: application/json'
field() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }
say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
post() { curl -s -w '   [HTTP %{http_code}]\n' "$@"; }
login() { curl -s $B/auth/login -H "$J" -d "{\"email\":\"$1\",\"password\":\"$2\"}" | field '["data"]["token"]'; }

T1=$(login user1@example.com user123)
T2=$(login user2@example.com user123)
MOUSE=$(curl -s "$B/products?q=mouse" | field '["data"][0]["_id"]')
KEYB=$(curl -s "$B/products?q=keyboard" | field '["data"][0]["_id"]')

if [ "$(curl -s $B/products/$MOUSE | field '["data"]["stock"]')" != "1" ]; then
  echo "Mouse stock is not 1. Run: npm run reset"; exit 1
fi

order() { post $B/orders -H "Authorization: Bearer $1" -H "$J" -d "$2"; }

say "1. Validation: expect 400 VALIDATION_ERROR (twice)"
order $T1 "{\"items\":[{\"productId\":\"$KEYB\",\"quantity\":0}]}"
order $T1 '{"items":[{"productId":"abc","quantity":1}]}'

say "2. Price tampering: expect 400"
order $T1 "{\"items\":[{\"productId\":\"$KEYB\",\"quantity\":2,\"price\":1}]}"

say "3. Race: 8 parallel orders for the last mouse. Expect one 201 and seven 409"
for t in $T1 $T2 $T1 $T2 $T1 $T2 $T1 $T2; do
  curl -s -o /dev/null -w '%{http_code}\n' $B/orders -H "Authorization: Bearer $t" -H "$J" -d "{\"items\":[{\"productId\":\"$MOUSE\",\"quantity\":1}]}" &
done | sort | uniq -c
wait
echo "   mouse stock now: $(curl -s $B/products/$MOUSE | field '["data"]["stock"]') (expect 0)"

say "4. Payments"
O=$(curl -s $B/orders -H "Authorization: Bearer $T1" -H "$J" -d "{\"items\":[{\"productId\":\"$KEYB\",\"quantity\":2}]}" | field '["data"]["_id"]')
TOTAL=$(curl -s $B/orders/$O -H "Authorization: Bearer $T1" | field '["data"]["total"]')
echo "   order total (computed by the server): $TOTAL"
K=key-$RANDOM$RANDOM
pay() { post $B/payments -H "Authorization: Bearer $T1" -H "$J" -H "Idempotency-Key: $1" -d "{\"orderId\":\"$O\",\"amount\":$2}"; }
echo "   wrong amount: expect 400 AMOUNT_MISMATCH"; pay $K 100
echo "   correct amount: expect 201"; pay $K $TOTAL
echo "   same Idempotency-Key again: expect 200 and the same _id"; pay $K $TOTAL
echo "   different key, same order: expect 409 PAYMENT_IN_PROGRESS"; pay other-$K $TOTAL
PM=$(curl -s $B/payments -H "Authorization: Bearer $T1" -H "$J" -H "Idempotency-Key: $K" -d "{\"orderId\":\"$O\",\"amount\":$TOTAL}" | field '["data"]["_id"]')

say "5. Callbacks"
cb() { post $B/payments/callback -H "$J" -H "x-callback-secret: dev-secret" -d "{\"paymentId\":\"$PM\",\"status\":\"$1\",\"amount\":$2}"; }
echo "   no secret: expect 401"; post $B/payments/callback -H "$J" -d '{}'
echo "   wrong amount: expect 400"; cb succeeded 100
echo "   three identical callbacks: expect 200 x3"; cb succeeded $TOTAL; cb succeeded $TOTAL; cb succeeded $TOTAL
echo "   late conflicting callback: expect 200 but still Succeeded"; cb failed $TOTAL
echo "   order status: $(curl -s $B/orders/$O -H "Authorization: Bearer $T1" | field '["data"]["status"]') (expect Paid)"
echo "   keyboard stock: $(curl -s $B/products/$KEYB | field '["data"]["stock"]') (expect 8, deducted once)"

say "6. State machine and ownership"
echo "   PATCH status: expect 404"; post -X PATCH $B/orders/$O -H "Authorization: Bearer $T1" -H "$J" -d '{"status":"Paid"}'
echo "   cancel a paid order: expect 409"; post -X POST $B/orders/$O/cancel -H "Authorization: Bearer $T1"
echo "   other user reads it: expect 404"; post $B/orders/$O -H "Authorization: Bearer $T2"
