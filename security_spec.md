# Security Specification for Firestore Database (Taquería Villa)

This document outlines the attribute-based access control (ABAC) rules, data validation models, and negative payloads that must be strictly rejected by our Firestore Security Rules.

## 1. Core Data Invariants

1. **Self-Ownership (PII Protection)**:
   - A user profile inside `/usuarios/{userId}` can only be read, created, or updated by the authenticated user whose `request.auth.uid == userId`.
   - No standard user can read other users' documents in `/usuarios`.

2. **Privilege Isolation**:
   - Only the admin account (`alvarukirtx@gmail.com`) can create, update, or delete products inside `/productos`. Standard users have read-only access to `/productos`.
   - Users cannot assign themselves `role = "admin"`. Roles must be verified against their authenticated identity email.
   - Admin check relies on checking if `request.auth.token.email == "alvarukirtx@gmail.com" && request.auth.token.email_verified == true`.

3. **Order Integrity**:
   - A user can create a document inside `/pedidos` if they are signed in, the ID matches, the `userId` matches their UID, and the `status` is created as `'pendiente'`.
   - Standard users can only view their own orders via query limits (where `userId == auth.uid`).
   - Standard users can update their own orders ONLY if the current status is `'pendiente'` (pre-acceptance phase) and cannot change the status fields to other states (like `'preparacion'`, `'en_camino'`, `'entregado'`).
   - Standard users can cancel their own orders (update status to `'cancelado'`).
   - Admins can read all orders, search all orders, and change status of any order to any state.

4. **Sales Ledger**:
   - Only the admin can read, list, write, or delete in `/ventas` and `/pedidos_cancelados`.
   - Standard users have zero access to `/ventas` and `/pedidos_cancelados`.

---

## 2. The "Dirty Dozen" Malicious Payloads

The following payloads represent malicious requests. Our Security Rules must return `PERMISSION_DENIED` for all of them.

### Attack 1: Standard User sets own role to admin
* **Collection**: `/usuarios/user_abc`
* **Actor**: Logged in as `user_abc` (email `client@gmail.com`)
* **Payload**: `{"uid": "user_abc", "email": "client@gmail.com", "role": "admin", "displayName": "Client"}`
* **Expected Outcome**: `PERMISSION_DENIED` (cannot modify `role` to admin)

### Attack 2: Read PII of another user
* **Collection**: `/usuarios/other_user_uid`
* **Actor**: Logged in as `user_abc`
* **Operation**: `get` `/usuarios/other_user_uid`
* **Expected Outcome**: `PERMISSION_DENIED`

### Attack 3: Non-Admin attempts to create a Menu Product
* **Collection**: `/productos/taco_al_pastor_extra`
* **Actor**: Logged in as `user_abc`
* **Payload**: `{"id": "taco_al_pastor_extra", "name": "Super Pastor Taco", "category": "tacos", "price": 0.50, "available": true}`
* **Expected Outcome**: `PERMISSION_DENIED`

### Attack 4: Non-Admin attempts to alter the price of an existing product
* **Collection**: `/productos/pastor`
* **Actor**: Logged in as `user_abc`
* **Payload**: Altering `price` from `15` to `1`
* **Expected Outcome**: `PERMISSION_DENIED`

### Attack 5: Standard User attempts to hijack someone else's order
* **Collection**: `/pedidos/order_444`
* **Actor**: Logged in as `user_abc` (target order belongs to `user_xyz`)
* **Operation**: `get` `/pedidos/order_444` or `write` `/pedidos/order_444`
* **Expected Outcome**: `PERMISSION_DENIED`

### Attack 6: Standard User attempts to create an order marked as "Entregado" directly
* **Collection**: `/pedidos/order_new`
* **Actor**: Logged in as `user_abc`
* **Payload**: `{"id": "order_new", "userId": "user_abc", "status": "entregado", "total": 120, "items": [...]}`
* **Expected Outcome**: `PERMISSION_DENIED` (status must be `'pendiente'` on create)

### Attack 7: Standard User attempts to modify an order in preparation
* **Collection**: `/pedidos/order_in_prep`
* **Actor**: Logged in as `user_abc` (Order already has status = `'preparacion'`)
* **Payload**: Change quantity or description.
* **Expected Outcome**: `PERMISSION_DENIED` (only `'pendiente'` status orders can be edited by client)

### Attack 8: Standard User attempts to update Order Status of their own order to "Entregado"
* **Collection**: `/pedidos/order_mine`
* **Actor**: Logged in as `user_abc`
* **Payload**: Update `status` to `'entregado'`
* **Expected Outcome**: `PERMISSION_DENIED` (cannot force delivered state)

### Attack 9: Standard User attempts to read Sales Earnings `/ventas`
* **Collection**: `/ventas`
* **Actor**: Logged in as `user_abc`
* **Operation**: `list` or `get` `/ventas/some_sale_id`
* **Expected Outcome**: `PERMISSION_DENIED`

### Attack 10: Standard User attempts to inject a mega string as product description (Denial of Wallet)
* **Collection**: `/productos/pastor`
* **Actor**: Admin (or standard user if bypass attempted)
* **Payload**: Description exceeding 2000 chars or ID injection.
* **Expected Outcome**: `PERMISSION_DENIED` (due to `.size() <= 1000` rule)

### Attack 11: Spoofed Admin (Unverified Email Claim)
* **Collection**: `/productos/pastor`
* **Actor**: User with email `alvarukirtx@gmail.com` but `email_verified == false` in Auth token
* **Operation**: Create or update product
* **Expected Outcome**: `PERMISSION_DENIED` (must be `email_verified == true`)

### Attack 12: Standard User attempts to read Cancelled Orders log
* **Collection**: `/pedidos_cancelados`
* **Actor**: Logged in as `user_abc`
* **Operation**: `list`
* **Expected Outcome**: `PERMISSION_DENIED`

---

## 3. Test Verification Rules

We verify these invariants inside our firebase security structure.
- Verification ensures that `request.auth.token.email == 'alvarukirtx@gmail.com' && request.auth.token.email_verified == true` is the sole administrative role verifier.
- Users can write their contact info and read their own histories.
- Every read/write is locked down to specific validators.
