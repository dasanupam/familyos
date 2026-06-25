#!/usr/bin/env python3
"""LifeOS Backend API Test Suite"""
import requests
import json
import sys
from datetime import date

# Backend URL from frontend/.env
BASE_URL = "https://lifeos-dev-3.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
ADMIN_EMAIL = "anupam@familyos.app"
ADMIN_PASSWORD = "Test@1234"
MEMBER_EMAIL = "abhilasha@familyos.app"
MEMBER_PASSWORD = "Test@1234"
ARINDAM_EMAIL = "arindam@familyos.app"
ARINDAM_PASSWORD = "Test@1234"

# Test state
admin_token = None
member_token = None
arindam_token = None
admin_user = None
member_user = None
arindam_user = None
arindam_member_id = None

def log_test(name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {name}")
    if details:
        print(f"  → {details}")
    return passed

def test_auth_login_admin():
    """Test 1: Login as admin (anupam@familyos.app)"""
    global admin_token, admin_user
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        
        if resp.status_code != 200:
            return log_test("Auth: Admin login", False, f"Status {resp.status_code}: {resp.text}")
        
        data = resp.json()
        
        # Must have access_token field (not "token")
        if "access_token" not in data:
            return log_test("Auth: Admin login", False, f"Missing 'access_token' field. Got: {list(data.keys())}")
        
        admin_token = data["access_token"]
        admin_user = data.get("user", {})
        
        # Must have role=admin
        if admin_user.get("role") != "admin":
            return log_test("Auth: Admin login", False, f"Expected role=admin, got {admin_user.get('role')}")
        
        return log_test("Auth: Admin login", True, f"Token received, role={admin_user.get('role')}")
    except Exception as e:
        return log_test("Auth: Admin login", False, str(e))

def test_auth_login_member():
    """Test 2: Login as member (abhilasha@familyos.app)"""
    global member_token, member_user
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": MEMBER_EMAIL,
            "password": MEMBER_PASSWORD
        }, timeout=10)
        
        if resp.status_code != 200:
            return log_test("Auth: Member login", False, f"Status {resp.status_code}: {resp.text}")
        
        data = resp.json()
        
        # Must have access_token field
        if "access_token" not in data:
            return log_test("Auth: Member login", False, f"Missing 'access_token' field. Got: {list(data.keys())}")
        
        member_token = data["access_token"]
        member_user = data.get("user", {})
        
        # Must have role=member
        if member_user.get("role") != "member":
            return log_test("Auth: Member login", False, f"Expected role=member, got {member_user.get('role')}")
        
        return log_test("Auth: Member login", True, f"Token received, role={member_user.get('role')}")
    except Exception as e:
        return log_test("Auth: Member login", False, str(e))

def test_auth_register():
    """Test 3: Register new user"""
    try:
        import random
        test_email = f"test_{random.randint(100000, 999999)}@familyos.app"
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "email": test_email,
            "password": "TestPass@123",
            "name": "Test User"
        }, timeout=10)
        
        if resp.status_code != 200:
            return log_test("Auth: Register", False, f"Status {resp.status_code}: {resp.text}")
        
        data = resp.json()
        
        # Must have access_token field
        if "access_token" not in data:
            return log_test("Auth: Register", False, f"Missing 'access_token' field. Got: {list(data.keys())}")
        
        return log_test("Auth: Register", True, f"User {test_email} registered successfully")
    except Exception as e:
        return log_test("Auth: Register", False, str(e))

def test_auth_me():
    """Test 4: GET /api/auth/me with Bearer token"""
    try:
        resp = requests.get(f"{BASE_URL}/auth/me", 
                           headers={"Authorization": f"Bearer {admin_token}"},
                           timeout=10)
        
        if resp.status_code != 200:
            return log_test("Auth: /me endpoint", False, f"Status {resp.status_code}: {resp.text}")
        
        data = resp.json()
        
        # Must have role field
        if "role" not in data:
            return log_test("Auth: /me endpoint", False, f"Missing 'role' field. Got: {list(data.keys())}")
        
        return log_test("Auth: /me endpoint", True, f"User data retrieved, role={data.get('role')}")
    except Exception as e:
        return log_test("Auth: /me endpoint", False, str(e))

def test_rbac_member_403():
    """Test 5: GET /api/members with member token → 403"""
    try:
        resp = requests.get(f"{BASE_URL}/members",
                           headers={"Authorization": f"Bearer {member_token}"},
                           timeout=10)
        
        if resp.status_code != 403:
            return log_test("RBAC: Member GET /members → 403", False, 
                          f"Expected 403, got {resp.status_code}: {resp.text}")
        
        return log_test("RBAC: Member GET /members → 403", True, "Correctly denied")
    except Exception as e:
        return log_test("RBAC: Member GET /members → 403", False, str(e))

def test_rbac_admin_members():
    """Test 6: GET /api/members with admin token → 5 members"""
    global arindam_member_id
    try:
        resp = requests.get(f"{BASE_URL}/members",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           timeout=10)
        
        if resp.status_code != 200:
            return log_test("RBAC: Admin GET /members", False, 
                          f"Status {resp.status_code}: {resp.text}")
        
        members = resp.json()
        
        if not isinstance(members, list):
            return log_test("RBAC: Admin GET /members", False, 
                          f"Expected list, got {type(members)}")
        
        if len(members) != 5:
            return log_test("RBAC: Admin GET /members", False, 
                          f"Expected 5 members, got {len(members)}")
        
        # Find Arindam's member_id for later tests
        for m in members:
            if m.get("name") == "Arindam Das":
                arindam_member_id = m.get("id")
                break
        
        return log_test("RBAC: Admin GET /members", True, 
                       f"Retrieved {len(members)} members")
    except Exception as e:
        return log_test("RBAC: Admin GET /members", False, str(e))

def test_labs_optional_member_id():
    """Test 7: POST /api/health/labs without member_id"""
    try:
        resp = requests.post(f"{BASE_URL}/health/labs",
                            headers={"Authorization": f"Bearer {member_token}"},
                            json={
                                "date": "2025-07-01",
                                "test": "TSH",
                                "value": 2.5,
                                "unit": "mIU/L"
                            },
                            timeout=10)
        
        if resp.status_code == 422:
            return log_test("Labs: Optional member_id", False, 
                          f"Got 422 validation error - member_id should be optional: {resp.text}")
        
        if resp.status_code != 200:
            return log_test("Labs: Optional member_id", False, 
                          f"Status {resp.status_code}: {resp.text}")
        
        data = resp.json()
        
        # Must have member_id set (not null)
        if not data.get("member_id"):
            return log_test("Labs: Optional member_id", False, 
                          f"member_id is null in response: {data}")
        
        return log_test("Labs: Optional member_id", True, 
                       f"Lab created with member_id={data.get('member_id')}")
    except Exception as e:
        return log_test("Labs: Optional member_id", False, str(e))

def test_data_isolation_create_transaction():
    """Test 8: Create transaction for Arindam as admin"""
    try:
        if not arindam_member_id:
            return log_test("Data Isolation: Create Arindam transaction", False, 
                          "Arindam member_id not found")
        
        resp = requests.post(f"{BASE_URL}/finance/transactions",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            json={
                                "member_id": arindam_member_id,
                                "date": "2025-06-15",
                                "amount": 5000.0,
                                "type": "expense",
                                "category": "shopping",
                                "merchant": "Test Store",
                                "note": "Test transaction for Arindam"
                            },
                            timeout=10)
        
        if resp.status_code != 200:
            return log_test("Data Isolation: Create Arindam transaction", False, 
                          f"Status {resp.status_code}: {resp.text}")
        
        return log_test("Data Isolation: Create Arindam transaction", True, 
                       "Transaction created for Arindam")
    except Exception as e:
        return log_test("Data Isolation: Create Arindam transaction", False, str(e))

def test_data_isolation_abhilasha_cant_see():
    """Test 9: Abhilasha can't see Arindam's transaction"""
    try:
        resp = requests.get(f"{BASE_URL}/finance/transactions",
                           headers={"Authorization": f"Bearer {member_token}"},
                           timeout=10)
        
        if resp.status_code != 200:
            return log_test("Data Isolation: Abhilasha filtered", False, 
                          f"Status {resp.status_code}: {resp.text}")
        
        transactions = resp.json()
        
        # Check if any transaction belongs to Arindam
        for tx in transactions:
            if tx.get("member_id") == arindam_member_id:
                return log_test("Data Isolation: Abhilasha filtered", False, 
                              f"Abhilasha can see Arindam's transaction: {tx}")
        
        # All transactions should belong to Abhilasha
        abhilasha_mid = member_user.get("linked_member_id")
        for tx in transactions:
            if tx.get("member_id") != abhilasha_mid:
                return log_test("Data Isolation: Abhilasha filtered", False, 
                              f"Transaction with wrong member_id: {tx}")
        
        return log_test("Data Isolation: Abhilasha filtered", True, 
                       f"Abhilasha sees only her {len(transactions)} transactions")
    except Exception as e:
        return log_test("Data Isolation: Abhilasha filtered", False, str(e))

def test_data_isolation_arindam_login():
    """Test 10: Login as Arindam and verify isolation"""
    global arindam_token, arindam_user
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": ARINDAM_EMAIL,
            "password": ARINDAM_PASSWORD
        }, timeout=10)
        
        if resp.status_code != 200:
            return log_test("Data Isolation: Arindam login", False, 
                          f"Status {resp.status_code}: {resp.text}")
        
        data = resp.json()
        arindam_token = data["access_token"]
        arindam_user = data.get("user", {})
        
        # Now get Arindam's transactions
        resp2 = requests.get(f"{BASE_URL}/finance/transactions",
                            headers={"Authorization": f"Bearer {arindam_token}"},
                            timeout=10)
        
        if resp2.status_code != 200:
            return log_test("Data Isolation: Arindam sees own data", False, 
                          f"Status {resp2.status_code}: {resp2.text}")
        
        transactions = resp2.json()
        
        # All transactions should belong to Arindam
        arindam_mid = arindam_user.get("linked_member_id")
        for tx in transactions:
            if tx.get("member_id") != arindam_mid:
                return log_test("Data Isolation: Arindam sees own data", False, 
                              f"Arindam sees transaction with wrong member_id: {tx}")
        
        # Should see at least the test transaction we created
        found_test = any(tx.get("note") == "Test transaction for Arindam" for tx in transactions)
        if not found_test:
            return log_test("Data Isolation: Arindam sees own data", False, 
                          "Arindam doesn't see the test transaction created for him")
        
        return log_test("Data Isolation: Arindam sees own data", True, 
                       f"Arindam sees only his {len(transactions)} transactions")
    except Exception as e:
        return log_test("Data Isolation: Arindam sees own data", False, str(e))

def test_crud_investments():
    """Test 11: POST /api/finance/investments"""
    try:
        resp = requests.post(f"{BASE_URL}/finance/investments",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            json={
                                "member_id": admin_user.get("linked_member_id"),
                                "name": "Test Mutual Fund",
                                "kind": "mutual_fund",
                                "units": 100.0,
                                "current_value": 15000.0,
                                "invested_value": 12000.0
                            },
                            timeout=10)
        
        if resp.status_code != 200:
            return log_test("CRUD: POST /finance/investments", False, 
                          f"Status {resp.status_code}: {resp.text}")
        
        return log_test("CRUD: POST /finance/investments", True, "Investment created")
    except Exception as e:
        return log_test("CRUD: POST /finance/investments", False, str(e))

def test_crud_loans():
    """Test 12: POST /api/finance/loans"""
    try:
        resp = requests.post(f"{BASE_URL}/finance/loans",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            json={
                                "member_id": admin_user.get("linked_member_id"),
                                "name": "Test Home Loan",
                                "outstanding": 500000.0,
                                "emi": 15000.0,
                                "rate": 8.5
                            },
                            timeout=10)
        
        if resp.status_code != 200:
            return log_test("CRUD: POST /finance/loans", False, 
                          f"Status {resp.status_code}: {resp.text}")
        
        return log_test("CRUD: POST /finance/loans", True, "Loan created")
    except Exception as e:
        return log_test("CRUD: POST /finance/loans", False, str(e))

def test_crud_finance_summary():
    """Test 13: GET /api/finance/summary"""
    try:
        resp = requests.get(f"{BASE_URL}/finance/summary",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           timeout=10)
        
        if resp.status_code != 200:
            return log_test("CRUD: GET /finance/summary", False, 
                          f"Status {resp.status_code}: {resp.text}")
        
        data = resp.json()
        required_fields = ["income_month", "expense_month", "net_worth"]
        for field in required_fields:
            if field not in data:
                return log_test("CRUD: GET /finance/summary", False, 
                              f"Missing field: {field}")
        
        return log_test("CRUD: GET /finance/summary", True, "Summary retrieved")
    except Exception as e:
        return log_test("CRUD: GET /finance/summary", False, str(e))

def test_crud_goals():
    """Test 14: GET /api/goals"""
    try:
        resp = requests.get(f"{BASE_URL}/goals",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           timeout=10)
        
        if resp.status_code != 200:
            return log_test("CRUD: GET /goals", False, 
                          f"Status {resp.status_code}: {resp.text}")
        
        return log_test("CRUD: GET /goals", True, "Goals retrieved")
    except Exception as e:
        return log_test("CRUD: GET /goals", False, str(e))

def test_crud_fire():
    """Test 15: GET /api/fire"""
    try:
        resp = requests.get(f"{BASE_URL}/fire",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           timeout=10)
        
        # 200 with data or null is acceptable
        if resp.status_code != 200:
            return log_test("CRUD: GET /fire", False, 
                          f"Status {resp.status_code}: {resp.text}")
        
        return log_test("CRUD: GET /fire", True, "FIRE data retrieved")
    except Exception as e:
        return log_test("CRUD: GET /fire", False, str(e))

def test_crud_trips():
    """Test 16: POST /api/travel/trips"""
    try:
        resp = requests.post(f"{BASE_URL}/travel/trips",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            json={
                                "member_id": admin_user.get("linked_member_id"),
                                "name": "Test Trip to Goa",
                                "destination": "Goa, India",
                                "start_date": "2025-08-01",
                                "end_date": "2025-08-07",
                                "budget": 50000.0
                            },
                            timeout=10)
        
        if resp.status_code != 200:
            return log_test("CRUD: POST /travel/trips", False, 
                          f"Status {resp.status_code}: {resp.text}")
        
        return log_test("CRUD: POST /travel/trips", True, "Trip created")
    except Exception as e:
        return log_test("CRUD: POST /travel/trips", False, str(e))

def test_crud_trips_get():
    """Test 17: GET /api/travel/trips"""
    try:
        resp = requests.get(f"{BASE_URL}/travel/trips",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           timeout=10)
        
        if resp.status_code != 200:
            return log_test("CRUD: GET /travel/trips", False, 
                          f"Status {resp.status_code}: {resp.text}")
        
        return log_test("CRUD: GET /travel/trips", True, "Trips retrieved")
    except Exception as e:
        return log_test("CRUD: GET /travel/trips", False, str(e))

def test_crud_career_roles():
    """Test 18: POST /api/career/roles"""
    try:
        resp = requests.post(f"{BASE_URL}/career/roles",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            json={
                                "member_id": admin_user.get("linked_member_id"),
                                "company": "Test Corp",
                                "title": "Senior Engineer",
                                "start_date": "2023-01-01",
                                "ctc": 2000000.0,
                                "location": "Bangalore"
                            },
                            timeout=10)
        
        if resp.status_code != 200:
            return log_test("CRUD: POST /career/roles", False, 
                          f"Status {resp.status_code}: {resp.text}")
        
        return log_test("CRUD: POST /career/roles", True, "Career role created")
    except Exception as e:
        return log_test("CRUD: POST /career/roles", False, str(e))

def test_crud_career_roles_get():
    """Test 19: GET /api/career/roles"""
    try:
        resp = requests.get(f"{BASE_URL}/career/roles",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           timeout=10)
        
        if resp.status_code != 200:
            return log_test("CRUD: GET /career/roles", False, 
                          f"Status {resp.status_code}: {resp.text}")
        
        return log_test("CRUD: GET /career/roles", True, "Career roles retrieved")
    except Exception as e:
        return log_test("CRUD: GET /career/roles", False, str(e))

def test_crud_dashboard_overview():
    """Test 20: GET /api/dashboard/overview"""
    try:
        resp = requests.get(f"{BASE_URL}/dashboard/overview",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           timeout=10)
        
        if resp.status_code != 200:
            return log_test("CRUD: GET /dashboard/overview", False, 
                          f"Status {resp.status_code}: {resp.text}")
        
        data = resp.json()
        required_fields = ["summary", "members", "goals"]
        for field in required_fields:
            if field not in data:
                return log_test("CRUD: GET /dashboard/overview", False, 
                              f"Missing field: {field}")
        
        return log_test("CRUD: GET /dashboard/overview", True, "Dashboard overview retrieved")
    except Exception as e:
        return log_test("CRUD: GET /dashboard/overview", False, str(e))

def test_service_abstraction():
    """Test 21: Verify service abstraction files exist"""
    import os
    
    ai_service_path = "/app/backend/services/ai_service.py"
    storage_service_path = "/app/backend/services/storage_service.py"
    ai_parser_path = "/app/backend/ai_parser.py"
    
    if not os.path.exists(ai_service_path):
        return log_test("Service Abstraction: ai_service.py exists", False, 
                       f"File not found: {ai_service_path}")
    
    if not os.path.exists(storage_service_path):
        return log_test("Service Abstraction: storage_service.py exists", False, 
                       f"File not found: {storage_service_path}")
    
    # Check ai_parser.py imports from services.ai_service
    with open(ai_parser_path, 'r') as f:
        lines = f.readlines()
        has_service_import = False
        has_direct_import = False
        in_docstring = False
        
        for line in lines:
            stripped = line.strip()
            
            # Track docstrings
            if '"""' in line or "'''" in line:
                in_docstring = not in_docstring
                continue
            
            # Skip comments and docstrings
            if stripped.startswith('#') or in_docstring:
                continue
            
            if "from services.ai_service import" in line:
                has_service_import = True
            if ("from emergentintegrations" in line or "import emergentintegrations" in line):
                has_direct_import = True
        
        if not has_service_import:
            return log_test("Service Abstraction: ai_parser imports correctly", False, 
                          "ai_parser.py doesn't import from services.ai_service")
        
        if has_direct_import:
            return log_test("Service Abstraction: ai_parser imports correctly", False, 
                          "ai_parser.py imports emergentintegrations directly")
    
    return log_test("Service Abstraction: Implementation verified", True, 
                   "All service files exist and imports are correct")

def main():
    """Run all tests"""
    print("=" * 70)
    print("LifeOS Backend API Test Suite")
    print("=" * 70)
    print(f"Backend URL: {BASE_URL}")
    print()
    
    tests = [
        # Auth tests
        test_auth_login_admin,
        test_auth_login_member,
        test_auth_register,
        test_auth_me,
        
        # RBAC tests
        test_rbac_member_403,
        test_rbac_admin_members,
        
        # Labs optional member_id
        test_labs_optional_member_id,
        
        # Data isolation tests
        test_data_isolation_create_transaction,
        test_data_isolation_abhilasha_cant_see,
        test_data_isolation_arindam_login,
        
        # CRUD tests
        test_crud_investments,
        test_crud_loans,
        test_crud_finance_summary,
        test_crud_goals,
        test_crud_fire,
        test_crud_trips,
        test_crud_trips_get,
        test_crud_career_roles,
        test_crud_career_roles_get,
        test_crud_dashboard_overview,
        
        # Service abstraction
        test_service_abstraction,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            result = test()
            if result:
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ FAIL: {test.__name__} - Unexpected error: {e}")
            failed += 1
        print()
    
    print("=" * 70)
    print(f"Test Results: {passed} passed, {failed} failed out of {passed + failed} total")
    print("=" * 70)
    
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
