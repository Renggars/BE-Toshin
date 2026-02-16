---
description: Workflow for testing Hardened RPH-LRP logic and Decimal Minute Precision
---

This workflow guides you through testing the new strict RPH lifecycle and precision lateness calculations.

### Prerequisites

- Operator Account
- Assigned Rencana Produksi (RPH) for today and the specific machine
- Token Bearer from Login

### 1. Authentication & Initial Context

**Endpoint**: `POST /auth/login`
**Payload**: `{"uid_nfc": "OPERATOR_NFC_ID", "password": "..."}`

- **Goal**: Obtain `accessToken`.

**Endpoint**: `GET /rencana-produksi?tanggal=YYYY-MM-DD`

- **Verify**:
  - `produksi.status_rph` is `ACTIVE`.
  - `context.andon_status` is `IDLE`.

### 2. Trigger RPH Switch (Authority Lock)

**Endpoint**: `POST /andon/trigger`
**Payload**:

```json
{
  "fk_id_mesin": 1,
  "fk_id_masalah": 24 // ID for "Pindah Produk" or other PLAN_DOWNTIME
}
```

- **Validation**:
  - The currently `ACTIVE` RPH is automatically `CLOSED` with `end_time = now()`.
  - The next `PLANNED` RPH is set to `WAITING_START`.
  - **Context Check**: `GET /rencana-produksi` should now show `andon_status: "RPH_SWITCH_IN_PROGRESS"`.

### 3. Resolve Switch (Lateness & Activation)

**Endpoint**: `PATCH /andon/{id}/resolve`
**Action**: Wait ~1-2 minutes before hitting this to test decimal precision.

- **Validation**:
  - `total_duration_menit` and `late_menit` should be `Float` (e.g., `1.25`).
  - `is_late` is `true` if duration > `masterMasalah.waktu_perbaikan_menit`.
  - The `WAITING_START` RPH becomes `ACTIVE` with `start_time = now()`.

### 4. LRP Strict Reporting (1:1 and Closed Status)

**Endpoint**: `POST /lrp`
**Payload**:

```json
{
  "tanggal": "YYYY-MM-DD",
  "fk_id_shift": 1,
  "fk_id_mesin": 1,
  "fk_id_operator": 1,
  "fk_id_rph": 123, // ID of the CLOSED RPH from Step 2
  "no_kanagata": "...",
  "no_lot": "...",
  "qty_ok": 100
}
```

- **Test Cases**:
  - **Success**: Reporting for a `CLOSED` RPH that hasn't been reported.
  - **Fail (Active)**: Hit `/lrp` using the now `ACTIVE` RPH ID. It should return `BAD_REQUEST` (RPH must be CLOSED).
  - **Fail (Duplicate)**: Post same LRP twice. It should return `CONFLICT` (Strict 1:1 mapping).

### 5. OEE Verification

**Endpoint**: `GET /oee/summary?tanggal=YYYY-MM-DD&plant=3`

- **Verify**:
  - `availability` and `performance` reflect the decimal downtime accurately.
  - `loading_time` is reduced by `PLAN_DOWNTIME` duration.
