// Quick API test for notification system - Toshin Backend
const BASE = "http://localhost:4001";

async function test() {
    console.log("========================================");
    console.log("  NOTIFICATION API TEST");
    console.log("========================================\n");

    // 1. Login as supervisor
    console.log("--- STEP 1: Login as supervisor ---");
    const loginRes = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "supervisor@gmail.com", password: "password123" }),
    });
    const loginData = await loginRes.json();

    if (loginRes.status !== 200) {
        console.log(`FAIL: Login returned ${loginRes.status}: ${loginData.message}`);
        return;
    }

    // Response shape: { message, data: { user, tokens, dashboard } }
    const token = loginData.data.tokens.access.token;
    const userId = loginData.data.user.id;
    console.log(`OK: Logged in as ${loginData.data.user.nama} (id=${userId}, role=${loginData.data.user.role})\n`);

    // 2. GET /notification (should be empty initially)
    console.log("--- STEP 2: GET /notification ---");
    const notifRes = await fetch(`${BASE}/notification`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const notifData = await notifRes.json();
    console.log(`Status: ${notifRes.status}`);
    console.log(`Count: ${notifData.data ? notifData.data.length : 0} notifications`);
    console.log(`Result: ${JSON.stringify(notifData, null, 2)}\n`);

    // 3. GET /notification/unread-count
    console.log("--- STEP 3: GET /notification/unread-count ---");
    const unreadRes = await fetch(`${BASE}/notification/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const unreadData = await unreadRes.json();
    console.log(`Status: ${unreadRes.status}`);
    console.log(`Result: ${JSON.stringify(unreadData)}\n`);

    // 4. Create RPH (triggers notification to user 3)
    console.log("--- STEP 4: POST /rencana-produksi (triggers RPH_ASSIGNED notif to user 3) ---");
    const rphRes = await fetch(`${BASE}/rencana-produksi`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            fk_id_user: 3,
            fk_id_mesin: 1,
            fk_id_produk: 1,
            fk_id_shift: 1,
            fk_id_target: 1,
            fk_id_jenis_pekerjaan: 1,
            tanggal: new Date().toISOString().split("T")[0],
            keterangan: "Test RPH for notification",
        }),
    });
    const rphData = await rphRes.json();
    console.log(`Status: ${rphRes.status}`);
    if (rphRes.status >= 400) {
        console.log(`Error: ${rphData.message || JSON.stringify(rphData)}\n`);
    } else {
        console.log(`OK: RPH created => notification should be sent to user 3\n`);
    }

    // 5. Login as user 3 and check their notifications
    console.log("--- STEP 5: Login as user 3 (op001) ---");
    const op1Res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "op001user@gmail.com", password: "password123" }),
    });
    const op1Data = await op1Res.json();

    if (op1Res.status !== 200) {
        console.log(`FAIL: Cannot login as user 3: ${op1Data.message}\n`);
        return;
    }

    const opToken = op1Data.data.tokens.access.token;
    console.log(`OK: Logged in as ${op1Data.data.user.nama} (id=${op1Data.data.user.id})\n`);

    // 6. GET /notification for user 3
    console.log("--- STEP 6: GET /notification (user 3) ---");
    const opNotifRes = await fetch(`${BASE}/notification`, {
        headers: { Authorization: `Bearer ${opToken}` },
    });
    const opNotifData = await opNotifRes.json();
    console.log(`Status: ${opNotifRes.status}`);
    console.log(`Result: ${JSON.stringify(opNotifData, null, 2)}\n`);

    // 7. GET unread count for user 3
    console.log("--- STEP 7: GET /notification/unread-count (user 3) ---");
    const opUnreadRes = await fetch(`${BASE}/notification/unread-count`, {
        headers: { Authorization: `Bearer ${opToken}` },
    });
    const opUnreadData = await opUnreadRes.json();
    console.log(`Status: ${opUnreadRes.status}`);
    console.log(`Result: ${JSON.stringify(opUnreadData)}\n`);

    // 8. Mark notification as read
    if (opNotifData.data && opNotifData.data.length > 0) {
        const notifId = opNotifData.data[0].id;
        console.log(`--- STEP 8: PATCH /notification/${notifId}/read ---`);
        const markRes = await fetch(`${BASE}/notification/${notifId}/read`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${opToken}` },
        });
        const markData = await markRes.json();
        console.log(`Status: ${markRes.status}`);
        console.log(`Result: ${JSON.stringify(markData)}\n`);

        // 9. Verify unread count decreased
        console.log("--- STEP 9: GET /notification/unread-count (after mark read) ---");
        const opUnread2 = await fetch(`${BASE}/notification/unread-count`, {
            headers: { Authorization: `Bearer ${opToken}` },
        });
        const opUnread2Data = await opUnread2.json();
        console.log(`Status: ${opUnread2.status}`);
        console.log(`Result: ${JSON.stringify(opUnread2Data)}\n`);
    } else {
        console.log("--- STEP 8: SKIP (no notifications found) ---\n");
    }

    // 10. PATCH /notification/read-all
    console.log("--- STEP 10: PATCH /notification/read-all (user 3) ---");
    const readAllRes = await fetch(`${BASE}/notification/read-all`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${opToken}` },
    });
    const readAllData = await readAllRes.json();
    console.log(`Status: ${readAllRes.status}`);
    console.log(`Result: ${JSON.stringify(readAllData)}\n`);

    console.log("========================================");
    console.log("  ALL TESTS COMPLETE");
    console.log("========================================");
}

test().catch((e) => { console.error("Test error:", e.message); });
