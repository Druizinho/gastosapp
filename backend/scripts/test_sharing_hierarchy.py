import sys, os, uuid
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import models
from app.sharing import assert_can_remove_member, assert_can_change_role
from fastapi import HTTPException

print("Testing Sharing Hierarchy Rules...")

owner_id = uuid.uuid4()
admin_id = uuid.uuid4()
member_id = uuid.uuid4()

share = models.Share(id=uuid.uuid4(), owner_id=owner_id, entity_type="debt")
owner_member = models.ShareMember(user_id=owner_id, role="admin")
admin_member = models.ShareMember(user_id=admin_id, role="admin")
common_member = models.ShareMember(user_id=member_id, role="member")

# 1. Owner can expel Admin and Member
try:
    assert_can_remove_member(share, owner_member, common_member)
    print("[PASS] Owner can remove Member")
except Exception as e:
    print("[FAIL] Owner remove Member failed:", e)
    sys.exit(1)

try:
    assert_can_remove_member(share, owner_member, admin_member)
    print("[PASS] Owner can remove Admin")
except Exception as e:
    print("[FAIL] Owner remove Admin failed:", e)
    sys.exit(1)

# 2. Admin can expel Member
try:
    assert_can_remove_member(share, admin_member, common_member)
    print("[PASS] Admin can remove Member")
except Exception as e:
    print("[FAIL] Admin remove Member failed:", e)
    sys.exit(1)

# 3. Admin CANNOT expel Admin
try:
    another_admin = models.ShareMember(user_id=uuid.uuid4(), role="admin")
    assert_can_remove_member(share, admin_member, another_admin)
    print("[FAIL] Admin should NOT remove Admin")
    sys.exit(1)
except HTTPException as e:
    print(f"[PASS] Admin blocked from removing Admin: {e.detail}")

# 4. Admin CANNOT expel Owner
try:
    assert_can_remove_member(share, admin_member, owner_member)
    print("[FAIL] Admin should NOT remove Owner")
    sys.exit(1)
except HTTPException as e:
    print(f"[PASS] Admin blocked from removing Owner: {e.detail}")

# 5. Member CANNOT expel anyone
try:
    assert_can_remove_member(share, common_member, admin_member)
    print("[FAIL] Member should NOT remove anyone")
    sys.exit(1)
except HTTPException as e:
    print(f"[PASS] Member blocked from removing Admin: {e.detail}")

# 6. Self leave is allowed for all
try:
    assert_can_remove_member(share, common_member, common_member)
    assert_can_remove_member(share, admin_member, admin_member)
    assert_can_remove_member(share, owner_member, owner_member)
    print("[PASS] Anyone can leave voluntarily")
except Exception as e:
    print("[FAIL] Voluntary leave failed:", e)
    sys.exit(1)

# 7. Role Changes
# Owner can promote Member to Admin
try:
    assert_can_change_role(share, owner_member, common_member, "admin")
    print("[PASS] Owner can promote Member to Admin")
except Exception as e:
    print("[FAIL] Owner promote failed:", e)
    sys.exit(1)

# Admin can promote Member to Admin
try:
    assert_can_change_role(share, admin_member, common_member, "admin")
    print("[PASS] Admin can promote Member to Admin")
except Exception as e:
    print("[FAIL] Admin promote failed:", e)
    sys.exit(1)

# Admin CANNOT demote Admin
try:
    assert_can_change_role(share, admin_member, another_admin, "member")
    print("[FAIL] Admin should NOT demote Admin")
    sys.exit(1)
except HTTPException as e:
    print(f"[PASS] Admin blocked from demoting Admin: {e.detail}")

# Owner CAN demote Admin to Member
try:
    assert_can_change_role(share, owner_member, admin_member, "member")
    print("[PASS] Owner can demote Admin to Member")
except Exception as e:
    print("[FAIL] Owner demote failed:", e)
    sys.exit(1)

# Nobody can change Owner's role
try:
    assert_can_change_role(share, owner_member, owner_member, "member")
    print("[FAIL] Should not change owner role")
    sys.exit(1)
except HTTPException as e:
    print(f"[PASS] Blocked changing owner role: {e.detail}")

print("\nAll Hierarchy and Expulsion Tests PASSED 100%! Ready for production.")
