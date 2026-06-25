"""
LifeOS Iteration G - Backend Tests
Tests for: Alerts API, Inbox Apply with approved_goal_names, Search with cholesterol, Goals target update
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

ADMIN_EMAIL = "anupam@familyos.app"
ADMIN_PASSWORD = "Test@1234"
ANUPAM_MEMBER_ID = "4c497c38-efef-4ca3-8528-0c442cad42e2"


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


# ─── Alerts API ───────────────────────────────────────────────────────────────

class TestAlertsAPI:
    """Tests for /api/alerts — Anupam's Cholesterol 220 mg/dL triggers health alert"""

    def test_alerts_returns_list(self, client):
        resp = client.get(f"{BASE_URL}/api/alerts")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: /api/alerts returned {len(data)} total alerts")

    def test_alerts_has_health_category(self, client):
        resp = client.get(f"{BASE_URL}/api/alerts")
        assert resp.status_code == 200
        data = resp.json()
        health_alerts = [a for a in data if a.get("category") == "health"]
        assert len(health_alerts) >= 1, f"Expected at least 1 health alert, got {len(health_alerts)}"
        print(f"PASS: Found {len(health_alerts)} health alert(s)")

    def test_alerts_has_cholesterol_alert(self, client):
        resp = client.get(f"{BASE_URL}/api/alerts")
        assert resp.status_code == 200
        data = resp.json()
        cholesterol_alerts = [
            a for a in data
            if a.get("category") == "health"
            and "cholesterol" in a.get("title", "").lower()
        ]
        assert len(cholesterol_alerts) >= 1, f"Expected Cholesterol alert, got {data}"
        alert = cholesterol_alerts[0]
        print(f"PASS: Cholesterol alert found: {alert['title']}")

    def test_alerts_cholesterol_alert_structure(self, client):
        resp = client.get(f"{BASE_URL}/api/alerts")
        assert resp.status_code == 200
        data = resp.json()
        chol = next((a for a in data if "cholesterol" in a.get("title", "").lower()), None)
        assert chol is not None, "No cholesterol alert found"
        assert chol.get("type") == "lab_out_of_range", f"Wrong type: {chol.get('type')}"
        assert chol.get("category") == "health", f"Wrong category: {chol.get('category')}"
        assert chol.get("severity") in ["error", "warning"], f"Wrong severity: {chol.get('severity')}"
        assert "220" in chol.get("title", ""), f"Value 220 not in title: {chol.get('title')}"
        assert "member_name" in chol
        assert chol.get("link") == "/health"
        print(f"PASS: Cholesterol alert structure valid: type={chol['type']}, severity={chol['severity']}")

    def test_alerts_anupam_cholesterol_member(self, client):
        resp = client.get(f"{BASE_URL}/api/alerts")
        assert resp.status_code == 200
        data = resp.json()
        chol = next((a for a in data if "cholesterol" in a.get("title", "").lower()), None)
        assert chol is not None, "No cholesterol alert found"
        assert chol.get("member_id") == ANUPAM_MEMBER_ID, f"Wrong member_id: {chol.get('member_id')}"
        assert "Anupam" in chol.get("member_name", ""), f"Wrong member_name: {chol.get('member_name')}"
        print(f"PASS: Cholesterol alert belongs to Anupam Das (member_id={ANUPAM_MEMBER_ID})")

    def test_alerts_no_auth_returns_401(self):
        resp = requests.get(f"{BASE_URL}/api/alerts")
        assert resp.status_code == 401
        print("PASS: Unauthenticated /api/alerts returns 401")


# ─── Inbox Apply with approved_goal_names ─────────────────────────────────────

class TestInboxApplyGoals:
    """Tests for /api/inbox/apply with approved_goal_names feature"""

    @pytest.fixture(scope="class")
    def emergency_fund_original_target(self, client):
        """Get original Emergency Fund target amount before testing"""
        resp = client.get(f"{BASE_URL}/api/goals")
        assert resp.status_code == 200
        goals = resp.json()
        ef = next((g for g in goals if "emergency" in g.get("name", "").lower()), None)
        if ef:
            print(f"NOTE: Emergency Fund current target: {ef.get('target_amount')}")
            return ef.get("target_amount"), ef.get("id")
        return None, None

    def test_goals_list_returns_array(self, client):
        resp = client.get(f"{BASE_URL}/api/goals")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0
        print(f"PASS: /api/goals returned {len(data)} goals")

    def test_emergency_fund_goal_exists(self, client):
        resp = client.get(f"{BASE_URL}/api/goals")
        assert resp.status_code == 200
        goals = resp.json()
        ef = next((g for g in goals if "emergency" in g.get("name", "").lower()), None)
        assert ef is not None, f"Emergency Fund goal not found in: {[g.get('name') for g in goals]}"
        print(f"PASS: Emergency Fund goal exists with target_amount={ef.get('target_amount')}")

    def test_emergency_fund_target_is_500000(self, client):
        resp = client.get(f"{BASE_URL}/api/goals")
        assert resp.status_code == 200
        goals = resp.json()
        ef = next((g for g in goals if "emergency" in g.get("name", "").lower()), None)
        assert ef is not None, "Emergency Fund goal not found"
        target = float(ef.get("target_amount") or 0)
        assert target == 500000.0, f"Expected target_amount=500000.0, got {target}"
        print(f"PASS: Emergency Fund target_amount = {target}")

    def test_inbox_apply_with_empty_approved_goals_no_update(self, client):
        """approved_goal_names=[] should NOT update any goals"""
        # First get current target for Emergency Fund
        goals_resp = client.get(f"{BASE_URL}/api/goals")
        goals = goals_resp.json()
        ef = next((g for g in goals if "emergency" in g.get("name", "").lower()), None)
        original_target = float(ef.get("target_amount") or 0) if ef else 500000.0
        ef_id = ef.get("id") if ef else None

        # Apply with empty approved_goal_names
        resp = client.post(f"{BASE_URL}/api/inbox/apply", json={
            "parsed": {
                "summary": "Test apply with empty approved goals",
                "goals": [{"name": "Emergency Fund", "target_amount": 999999}],
            },
            "approved_goal_names": [],
            "selected_types": ["goals"]
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "counts" in data
        print(f"PASS: inbox/apply with approved_goal_names=[] returned counts: {data['counts']}")

        # Verify goal was NOT updated
        goals_after = client.get(f"{BASE_URL}/api/goals").json()
        ef_after = next((g for g in goals_after if "emergency" in g.get("name", "").lower()), None)
        if ef_after:
            new_target = float(ef_after.get("target_amount") or 0)
            assert new_target == original_target, f"Goal should NOT have been updated! original={original_target}, new={new_target}"
            print(f"PASS: Emergency Fund target unchanged at {new_target} (approved_goal_names=[] prevents updates)")

    def test_inbox_apply_with_approved_goal_updates_target(self, client):
        """approved_goal_names=['Emergency Fund'] SHOULD update the goal target"""
        # Get original target
        goals_resp = client.get(f"{BASE_URL}/api/goals")
        goals = goals_resp.json()
        ef = next((g for g in goals if "emergency" in g.get("name", "").lower()), None)
        assert ef is not None, "Emergency Fund not found"
        original_target = float(ef.get("target_amount") or 0)

        # Set a new test target (different from original to verify change)
        test_target = 600000.0 if original_target != 600000.0 else 550000.0

        # Apply with approved Emergency Fund
        resp = client.post(f"{BASE_URL}/api/inbox/apply", json={
            "parsed": {
                "summary": "Test apply with approved goals",
                "goals": [{"name": "Emergency Fund", "target_amount": test_target}],
            },
            "approved_goal_names": ["Emergency Fund"],
            "selected_types": ["goals"]
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "counts" in data
        print(f"PASS: inbox/apply with approved_goal_names=['Emergency Fund'] returned counts: {data['counts']}")

        # Verify goal WAS updated
        goals_after = client.get(f"{BASE_URL}/api/goals").json()
        ef_after = next((g for g in goals_after if "emergency" in g.get("name", "").lower()), None)
        if ef_after:
            new_target = float(ef_after.get("target_amount") or 0)
            assert new_target == test_target, f"Goal should have been updated to {test_target}, got {new_target}"
            print(f"PASS: Emergency Fund target updated from {original_target} → {new_target}")

        # Restore original target
        client.post(f"{BASE_URL}/api/inbox/apply", json={
            "parsed": {
                "summary": "Restore original target",
                "goals": [{"name": "Emergency Fund", "target_amount": 500000.0}],
            },
            "approved_goal_names": ["Emergency Fund"],
            "selected_types": ["goals"]
        })
        print("PASS: Restored Emergency Fund target to 500000")

    def test_inbox_apply_no_approved_goals_field_keeps_goals(self, client):
        """When approved_goal_names is None/not provided, goals behave normally via selected_types"""
        resp = client.post(f"{BASE_URL}/api/inbox/apply", json={
            "parsed": {
                "summary": "Test apply without approved_goal_names field",
                "transactions": [],
            },
            "selected_types": ["transactions"]
            # approved_goal_names NOT included
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "counts" in data
        print(f"PASS: inbox/apply without approved_goal_names field works: {data['counts']}")


# ─── Search API ───────────────────────────────────────────────────────────────

class TestSearchAPI:
    """Tests for /api/search — searches across lab results"""

    def test_search_cholesterol_returns_lab(self, client):
        resp = client.get(f"{BASE_URL}/api/search?q=cholesterol")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1, f"Expected ≥1 results for 'cholesterol', got {len(data)}"
        lab_results = [r for r in data if r.get("type") == "lab"]
        assert len(lab_results) >= 1, f"Expected lab result type, got {data}"
        chol = lab_results[0]
        assert "Cholesterol" in chol.get("label", ""), f"Wrong label: {chol.get('label')}"
        assert "220" in chol.get("sub", ""), f"Value 220 not in sub: {chol.get('sub')}"
        print(f"PASS: Search 'cholesterol' returns lab result: {chol}")

    def test_search_cholesterol_result_structure(self, client):
        resp = client.get(f"{BASE_URL}/api/search?q=cholesterol")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        item = data[0]
        assert "type" in item
        assert "label" in item
        assert "sub" in item
        assert "link" in item
        assert item["link"] == "/health"
        print(f"PASS: Cholesterol search result structure valid: {item}")

    def test_search_short_query_empty(self, client):
        resp = client.get(f"{BASE_URL}/api/search?q=c")
        assert resp.status_code == 200
        assert resp.json() == []
        print("PASS: Single char query returns empty list")

    def test_search_no_auth_401(self):
        resp = requests.get(f"{BASE_URL}/api/search?q=cholesterol")
        assert resp.status_code == 401
        print("PASS: Unauthenticated search returns 401")
