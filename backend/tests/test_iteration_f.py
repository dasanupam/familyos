"""
LifeOS Iteration F - Backend Tests
Tests for: Global Search, Budget CRUD, Health endpoints, Finance summary
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

ADMIN_EMAIL = "anupam@familyos.app"
ADMIN_PASSWORD = "Test@1234"


@pytest.fixture(scope="module")
def auth_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if resp.status_code != 200:
        pytest.skip(f"Auth failed: {resp.status_code} - {resp.text}")
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    if not token:
        pytest.skip("No token in auth response")
    return token


@pytest.fixture(scope="module")
def client(auth_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"})
    return s


# ─── Global Search ───────────────────────────────────────────────────────────

class TestGlobalSearch:
    """Tests for /api/search endpoint"""

    def test_search_returns_array(self, client):
        resp = client.get(f"{BASE_URL}/api/search?q=test")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: /api/search?q=test returned {len(data)} results")

    def test_search_short_query_returns_empty(self, client):
        resp = client.get(f"{BASE_URL}/api/search?q=a")
        assert resp.status_code == 200
        data = resp.json()
        assert data == []
        print("PASS: Short query (1 char) returns empty array")

    def test_search_result_structure(self, client):
        resp = client.get(f"{BASE_URL}/api/search?q=an")
        assert resp.status_code == 200
        data = resp.json()
        if len(data) > 0:
            item = data[0]
            assert "type" in item, "Missing 'type' field"
            assert "label" in item, "Missing 'label' field"
            assert "sub" in item, "Missing 'sub' field"
            assert "link" in item, "Missing 'link' field"
            assert item["type"] in ["transaction", "goal", "lab", "appointment", "investment"]
            print(f"PASS: search result structure valid: {item}")
        else:
            print("NOTE: No results for 'an', structure check skipped")

    def test_search_max_12_results(self, client):
        resp = client.get(f"{BASE_URL}/api/search?q=the")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) <= 12
        print(f"PASS: Search results capped at ≤12, got {len(data)}")

    def test_search_no_auth_returns_401(self):
        resp = requests.get(f"{BASE_URL}/api/search?q=test")
        assert resp.status_code == 401
        print("PASS: Unauthenticated search returns 401")


# ─── Finance Budget CRUD ──────────────────────────────────────────────────────

class TestFinanceBudget:
    """Tests for /api/finance/budget CRUD"""

    budget_id = None

    def test_create_budget(self, client, auth_token):
        # Get first member id
        members_resp = client.get(f"{BASE_URL}/api/members")
        assert members_resp.status_code == 200
        members = members_resp.json()
        assert len(members) > 0
        member_id = members[0]["id"]

        resp = client.post(f"{BASE_URL}/api/finance/budget", json={
            "member_id": member_id,
            "month": "2026-02",
            "category": "TEST_groceries",
            "budgeted_amount": 10000.0
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert data["category"] == "TEST_groceries"
        assert data["budgeted_amount"] == 10000.0
        assert data["month"] == "2026-02"
        TestFinanceBudget.budget_id = data["id"]
        print(f"PASS: Budget created with id={data['id']}")

    def test_list_budgets(self, client):
        resp = client.get(f"{BASE_URL}/api/finance/budget?month=2026-02")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        # Should find the created budget
        budget_ids = [b["id"] for b in data]
        assert TestFinanceBudget.budget_id in budget_ids
        print(f"PASS: Budget list returned {len(data)} items")

    def test_list_budgets_has_actual_amount(self, client):
        resp = client.get(f"{BASE_URL}/api/finance/budget?month=2026-02")
        assert resp.status_code == 200
        data = resp.json()
        for b in data:
            assert "actual_amount" in b, f"Budget {b.get('id')} missing actual_amount field"
        print("PASS: All budget items have actual_amount field")

    def test_update_budget(self, client):
        if not TestFinanceBudget.budget_id:
            pytest.skip("No budget_id from create test")
        members_resp = client.get(f"{BASE_URL}/api/members")
        member_id = members_resp.json()[0]["id"]
        resp = client.put(f"{BASE_URL}/api/finance/budget/{TestFinanceBudget.budget_id}", json={
            "member_id": member_id,
            "month": "2026-02",
            "category": "TEST_groceries",
            "budgeted_amount": 15000.0
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["budgeted_amount"] == 15000.0
        print(f"PASS: Budget updated to 15000")

    def test_delete_budget(self, client):
        if not TestFinanceBudget.budget_id:
            pytest.skip("No budget_id from create test")
        resp = client.delete(f"{BASE_URL}/api/finance/budget/{TestFinanceBudget.budget_id}")
        assert resp.status_code == 200
        print(f"PASS: Budget deleted")

    def test_budget_not_found_after_delete(self, client):
        if not TestFinanceBudget.budget_id:
            pytest.skip("No budget_id from create test")
        resp = client.get(f"{BASE_URL}/api/finance/budget?month=2026-02")
        assert resp.status_code == 200
        data = resp.json()
        ids = [b["id"] for b in data]
        assert TestFinanceBudget.budget_id not in ids
        print("PASS: Budget not found after delete")


# ─── Health Endpoints ─────────────────────────────────────────────────────────

class TestHealthEndpoints:
    """Tests for health endpoints used in Health page"""

    def test_health_vitals_list(self, client):
        resp = client.get(f"{BASE_URL}/api/health/vitals")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: /api/health/vitals returned {len(data)} items")

    def test_health_labs_list(self, client):
        resp = client.get(f"{BASE_URL}/api/health/labs")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: /api/health/labs returned {len(data)} items")

    def test_health_appointments_list(self, client):
        resp = client.get(f"{BASE_URL}/api/health/appointments")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: /api/health/appointments returned {len(data)} items")

    def test_health_active_medications_list(self, client):
        resp = client.get(f"{BASE_URL}/api/health/active-medications")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: /api/health/active-medications returned {len(data)} items")

    def test_health_prescriptions_list(self, client):
        resp = client.get(f"{BASE_URL}/api/health/prescriptions")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: /api/health/prescriptions returned {len(data)} items")


# ─── Finance Summary & Insurance ─────────────────────────────────────────────

class TestFinanceSummary:
    """Tests for finance summary and insurance expiry highlight"""

    def test_finance_summary_endpoint(self, client):
        resp = client.get(f"{BASE_URL}/api/finance/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "net_worth" in data
        assert "invest_value" in data
        assert "debt" in data
        print(f"PASS: /api/finance/summary returned: {data}")

    def test_finance_transactions_list(self, client):
        resp = client.get(f"{BASE_URL}/api/finance/transactions")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: /api/finance/transactions returned {len(data)} items")

    def test_finance_insurance_list(self, client):
        resp = client.get(f"{BASE_URL}/api/finance/insurance")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: /api/finance/insurance returned {len(data)} items")

    def test_finance_subscriptions_list(self, client):
        resp = client.get(f"{BASE_URL}/api/finance/subscriptions")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: /api/finance/subscriptions returned {len(data)} items")

    def test_create_insurance_expiring_soon(self, client):
        """Create insurance policy expiring within 30 days"""
        from datetime import datetime, timedelta
        members_resp = client.get(f"{BASE_URL}/api/members")
        member_id = members_resp.json()[0]["id"]
        # Expiry in 10 days
        expiry = (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
        resp = client.post(f"{BASE_URL}/api/finance/insurance", json={
            "member_id": member_id,
            "insurer": "TEST_Expiring Soon Insurance",
            "policy_type": "health",
            "policy_number": "TEST_POL_001",
            "sum_assured": 500000,
            "annual_premium": 25000,
            "policy_end": expiry
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        TestFinanceSummary.expiring_insurance_id = data["id"]
        print(f"PASS: Expiring insurance policy created: {data['id']}, ends {expiry}")

    def test_verify_insurance_in_list(self, client):
        resp = client.get(f"{BASE_URL}/api/finance/insurance")
        assert resp.status_code == 200
        data = resp.json()
        found = any(i.get("insurer") == "TEST_Expiring Soon Insurance" for i in data)
        assert found, "Could not find newly created insurance policy"
        print("PASS: Expiring insurance policy visible in list")

    def test_cleanup_insurance(self, client):
        if hasattr(TestFinanceSummary, "expiring_insurance_id"):
            resp = client.delete(f"{BASE_URL}/api/finance/insurance/{TestFinanceSummary.expiring_insurance_id}")
            assert resp.status_code == 200
            print("PASS: Cleanup - expiring insurance deleted")
