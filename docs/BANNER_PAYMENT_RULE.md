# Banner ownership – strict payment-only (Razorpay verified)

**Core business rule:** A user **owns a banner ONLY if there is a verified `BannerPayment` record** for that `userId` + `bannerId` with `paymentStatus` = verified (or legacy `completed`).

- `user.bannerInventory` is **not** the source of truth.
- `equippedBanner` must only be from paid banners.
- Direct purchase without Razorpay is **completely disabled**.

---

## 1. Backend enforcement

### A. Inventory (getUserInventory)

- Fetches all `BannerPayment` where `userId = currentUser._id` and `paymentStatus` is verified (or completed).
- Builds the set of paid `bannerIds`.
- Returns **only** those banners as inventory.
- Ignores anything in `user.bannerInventory` that has no verified payment.
- If `user.equippedBanner` is not in the paid set, sets it to `null` and saves the user.

Ownership is derived from `BannerPayment`, not from `user.bannerInventory`.

### B. Direct purchase route – disabled

**Route:** `POST /api/banners/user/purchase/:id`

Response:

```js
res.status(400).json({
  message: "Banner purchase requires payment. Please use the Pay button on the banner to complete payment."
});
```

It must **never** add a banner to inventory, modify the user, or return success.

### C. Razorpay verification = only way to add banner

After successful Razorpay verification (`verifyBannerPayment`):

1. Create `BannerPayment` record with:
   - `userId`, `bannerId`, `orderId` (Razorpay order id), `razorpayPaymentId`, `paymentStatus: 'verified'`, amount, etc.
2. Optionally update `user.bannerInventory` for caching (inventory is still derived from BannerPayment on read).

**Ownership check everywhere:**

```js
const hasPaid = await BannerPayment.exists({
  user: userId,
  banner: bannerId,
  paymentStatus: { $in: ['verified', 'completed'] }
});
```

No other logic is allowed for “user owns banner”.

---

## 2. Admin one-time cleanup (sync inventory)

**Endpoint:** `POST /api/admin/banners/sync-inventory` (admin only)

**Logic:**

- For every user:
  1. Get all BannerPayment with `paymentStatus` verified (or completed).
  2. Build `paidBannerIds` set.
  3. Set `user.bannerInventory = paidBannerIds`.
  4. If `equippedBanner` is not in `paidBannerIds`, set to `null`.
  5. Save user.

**Response:**

```json
{
  "success": true,
  "usersUpdated": X,
  "unpaidBannersRemoved": Y,
  "data": { "usersChecked": N, "usersUpdated": X, "unpaidBannersRemoved": Y }
}
```

---

## 3. Global ownership check

Anywhere the backend checks “user owns banner”, use:

```js
const hasPaid = await BannerPayment.exists({
  user: userId,
  banner: bannerId,
  paymentStatus: { $in: ['verified', 'completed'] }
});
```

Used in:

- `getUserInventory` (paid set)
- `getUserEquippedBanner` (return equipped only if verified)
- `equipBanner` (allow equip only if verified)

---

## 4. Frontend rules

- **Store page:** If banner ID is in `getUserInventory()` response → show “Owned”. Else → show “Pay”.
- **No** “Purchased successfully” from direct purchase; success only after Razorpay verify.
- UI depends **only** on backend inventory response (no client-side ownership assumptions).

---

## 5. Security

- Never trust client.
- Never trust local state.
- Never trust `user.bannerInventory` for ownership.
- Only trust verified Razorpay + `BannerPayment` (verified/completed).

---

## 6. Expected result

- Users cannot get banners without payment.
- Old fake purchases are removed (via sync or on next inventory read).
- Equipped banners are always valid (verified payment).
- UI is aligned with the payment-only rule.
- Admin can clean the entire system anytime with sync-inventory.
