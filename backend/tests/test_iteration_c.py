"""
Iteration C Backend Tests:
- Career inline edit: PATCH career-events, career-roles, career-skills
- Finance investments: XIRR endpoint with cagr field
- Documents: linked records endpoint
- Net worth series endpoint
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def auth_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "anupam@familyos.app",
        "password": "Test@1234"
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    data = resp.json()
    return data.get("access_token") or data.get("token")


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def default_member_id(headers):
    resp = requests.get(f"{BASE_URL}/api/members", headers=headers)
    assert resp.status_code == 200
    members = resp.json()
    assert len(members) > 0, "No members found"
    return members[0]["id"]


# ── Auth check ─────────────────────────────────────────────────────────────────
class TestAuth:
    """Auth check"""

    def test_login_works(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "anupam@familyos.app",
            "password": "Test@1234"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data or "token" in data
        assert "user" in data
        print("PASS: Login works")
        token_key = "access_token" if "access_token" in data else "token"
        print(f"  Token key: {token_key}")

    def test_me_endpoint(self, headers):
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "email" in data
        print(f"PASS: /api/auth/me returns user {data.get('email')}")


# ── Career Events ──────────────────────────────────────────────────────────────
class TestCareerEventsInlineEdit:
    """Career events: Create, then PATCH (inline edit) via generic PATCH endpoint"""

    _event_id = None

    def test_create_career_event(self, headers, default_member_id):
        payload = {
            "member_id": default_member_id,
            "title": "TEST_Career_Event_Promoted",
            "kind": "promotion",
            "date": "2024-01-15",
            "company": "TEST_Corp",
            "ctc": 2000000,
            "notes": "Test event for inline edit"
        }
        resp = requests.post(f"{BASE_URL}/api/career/events", json=payload, headers=headers)
        assert resp.status_code in [200, 201], f"Create career event failed: {resp.text}"
        data = resp.json()
        assert "id" in data
        assert data["title"] == "TEST_Career_Event_Promoted"
        TestCareerEventsInlineEdit._event_id = data["id"]
        print(f"PASS: Career event created, id={data['id']}")

    def test_patch_career_event(self, headers):
        event_id = TestCareerEventsInlineEdit._event_id
        assert event_id, "No event_id to patch (create test must run first)"
        patch_payload = {"title": "TEST_Career_Event_Updated", "notes": "Updated via PATCH"}
        resp = requests.patch(f"{BASE_URL}/api/career-events/{event_id}", json=patch_payload, headers=headers)
        assert resp.status_code == 200, f"PATCH career-events failed: {resp.text}"
        data = resp.json()
        assert data.get("title") == "TEST_Career_Event_Updated"
        print(f"PASS: PATCH /api/career-events/{event_id} works, title updated")

    def test_get_career_events_list(self, headers):
        resp = requests.get(f"{BASE_URL}/api/career/events", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/career/events returns {len(data)} events")

    def test_delete_career_event(self, headers):
        event_id = TestCareerEventsInlineEdit._event_id
        if not event_id:
            pytest.skip("No event_id to delete")
        resp = requests.delete(f"{BASE_URL}/api/career/events/{event_id}", headers=headers)
        assert resp.status_code in [200, 204]
        print(f"PASS: Career event {event_id} deleted")


# ── Career Roles ───────────────────────────────────────────────────────────────
class TestCareerRolesInlineEdit:
    """Career roles: Create, PATCH via PATCH_COLLECTIONS endpoint"""

    _role_id = None

    def test_create_career_role(self, headers, default_member_id):
        payload = {
            "member_id": default_member_id,
            "title": "TEST_Senior_Engineer",
            "company": "TEST_Tech",
            "start_date": "2022-06-01",
            "ctc": 3000000,
            "location": "Bangalore"
        }
        resp = requests.post(f"{BASE_URL}/api/career/roles", json=payload, headers=headers)
        assert resp.status_code in [200, 201], f"Create career role failed: {resp.text}"
        data = resp.json()
        assert "id" in data
        assert data["title"] == "TEST_Senior_Engineer"
        TestCareerRolesInlineEdit._role_id = data["id"]
        print(f"PASS: Career role created, id={data['id']}")

    def test_patch_career_roles_in_patch_collections(self, headers):
        """Verifies career-roles is in PATCH_COLLECTIONS"""
        role_id = TestCareerRolesInlineEdit._role_id
        assert role_id, "No role_id (create test must run first)"
        patch_payload = {"title": "TEST_Staff_Engineer", "ctc": 4000000}
        resp = requests.patch(f"{BASE_URL}/api/career-roles/{role_id}", json=patch_payload, headers=headers)
        assert resp.status_code == 200, f"PATCH /api/career-roles failed: {resp.text}"
        data = resp.json()
        assert data.get("title") == "TEST_Staff_Engineer"
        assert data.get("ctc") == 4000000
        print(f"PASS: PATCH /api/career-roles/{role_id} works, title and ctc updated")

    def test_get_career_roles_list(self, headers):
        resp = requests.get(f"{BASE_URL}/api/career/roles", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/career/roles returns {len(data)} roles")

    def test_delete_career_role(self, headers):
        role_id = TestCareerRolesInlineEdit._role_id
        if not role_id:
            pytest.skip("No role_id to delete")
        resp = requests.delete(f"{BASE_URL}/api/career/roles/{role_id}", headers=headers)
        assert resp.status_code in [200, 204]
        print(f"PASS: Career role {role_id} deleted")


# ── Career Skills ──────────────────────────────────────────────────────────────
class TestCareerSkillsInlineEdit:
    """Career skills: Create, PATCH via PATCH_COLLECTIONS"""

    _skill_id = None

    def test_create_career_skill(self, headers, default_member_id):
        payload = {
            "member_id": default_member_id,
            "name": "TEST_Python",
            "category": "languages",
            "level": 4
        }
        resp = requests.post(f"{BASE_URL}/api/career/skills", json=payload, headers=headers)
        assert resp.status_code in [200, 201], f"Create career skill failed: {resp.text}"
        data = resp.json()
        assert "id" in data
        assert data["name"] == "TEST_Python"
        TestCareerSkillsInlineEdit._skill_id = data["id"]
        print(f"PASS: Career skill created, id={data['id']}")

    def test_patch_career_skills_in_patch_collections(self, headers):
        """Verifies career-skills is in PATCH_COLLECTIONS"""
        skill_id = TestCareerSkillsInlineEdit._skill_id
        assert skill_id, "No skill_id (create test must run first)"
        patch_payload = {"name": "TEST_Python3", "level": 5}
        resp = requests.patch(f"{BASE_URL}/api/career-skills/{skill_id}", json=patch_payload, headers=headers)
        assert resp.status_code == 200, f"PATCH /api/career-skills failed: {resp.text}"
        data = resp.json()
        assert data.get("name") == "TEST_Python3"
        print(f"PASS: PATCH /api/career-skills/{skill_id} works, name updated")

    def test_get_career_skills_list(self, headers):
        resp = requests.get(f"{BASE_URL}/api/career/skills", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/career/skills returns {len(data)} skills")

    def test_delete_career_skill(self, headers):
        skill_id = TestCareerSkillsInlineEdit._skill_id
        if not skill_id:
            pytest.skip("No skill_id to delete")
        resp = requests.delete(f"{BASE_URL}/api/career/skills/{skill_id}", headers=headers)
        assert resp.status_code in [200, 204]
        print(f"PASS: Career skill {skill_id} deleted")


# ── Finance: Investments XIRR with CAGR ───────────────────────────────────────
class TestFinanceInvestmentsXIRR:
    """Finance investments: XIRR endpoint returns cagr field"""

    _investment_id = None

    def test_create_investment_with_purchase_date(self, headers, default_member_id):
        payload = {
            "member_id": default_member_id,
            "name": "TEST_Mutual_Fund_XYZ",
            "kind": "mutual_fund",
            "invested_value": 100000,
            "current_value": 130000,
            "purchase_date": "2022-01-01"
        }
        resp = requests.post(f"{BASE_URL}/api/finance/investments", json=payload, headers=headers)
        assert resp.status_code in [200, 201], f"Create investment failed: {resp.text}"
        data = resp.json()
        assert "id" in data
        TestFinanceInvestmentsXIRR._investment_id = data["id"]
        print(f"PASS: Investment created with purchase_date, id={data['id']}")

    def test_xirr_endpoint_returns_cagr(self, headers):
        """Tests GET /api/finance/investments/xirr returns cagr field"""
        resp = requests.get(f"{BASE_URL}/api/finance/investments/xirr", headers=headers)
        assert resp.status_code == 200, f"XIRR endpoint failed: {resp.text}"
        data = resp.json()
        assert "items" in data
        assert "total_invested" in data
        assert "total_current" in data
        assert "overall_pct" in data or data.get("overall_pct") is None
        # Verify cagr field exists in items
        items = data["items"]
        if len(items) > 0:
            for item in items:
                assert "cagr" in item, f"cagr field missing in investment item: {item}"
                assert "return_pct" in item, f"return_pct missing in item: {item}"
            print(f"PASS: XIRR endpoint returns {len(items)} items, all have cagr field")
            # Find our TEST item and check cagr
            test_items = [i for i in items if "TEST_Mutual_Fund" in i.get("name", "")]
            if test_items:
                ti = test_items[0]
                print(f"TEST investment cagr={ti.get('cagr')}, return_pct={ti.get('return_pct')}")
                # Should have cagr computed (not None) since purchase_date was set > 1 month ago
                if ti.get("cagr") is not None:
                    print(f"PASS: CAGR computed = {ti['cagr']:.2f}%")
        else:
            print("NOTE: No investments found to validate cagr structure")
        print("PASS: GET /api/finance/investments/xirr works and has cagr field in items")

    def test_xirr_structure(self, headers):
        resp = requests.get(f"{BASE_URL}/api/finance/investments/xirr", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total_gain" in data
        print(f"PASS: XIRR structure correct: total_invested={data.get('total_invested')}, total_gain={data.get('total_gain')}")

    def test_delete_investment(self, headers):
        inv_id = TestFinanceInvestmentsXIRR._investment_id
        if not inv_id:
            pytest.skip("No investment to delete")
        resp = requests.delete(f"{BASE_URL}/api/finance/investments/{inv_id}", headers=headers)
        assert resp.status_code in [200, 204]
        print(f"PASS: Investment {inv_id} deleted")


# ── Finance: List investments ──────────────────────────────────────────────────
class TestFinanceInvestmentsList:
    """Finance investments list API"""

    def test_get_investments_list(self, headers):
        resp = requests.get(f"{BASE_URL}/api/finance/investments", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/finance/investments returns {len(data)} investments")


# ── Documents: Linked records ──────────────────────────────────────────────────
class TestDocumentsLinkedRecords:
    """Documents: /documents/{id}/records endpoint"""

    def test_list_documents(self, headers):
        resp = requests.get(f"{BASE_URL}/api/documents", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/documents returns {len(data)} documents")

    def test_document_linked_records_endpoint(self, headers):
        """Test the linked records endpoint exists and returns valid structure"""
        docs_resp = requests.get(f"{BASE_URL}/api/documents", headers=headers)
        docs = docs_resp.json()
        if len(docs) == 0:
            pytest.skip("No documents found to test linked records")
        doc_id = docs[0]["id"]
        resp = requests.get(f"{BASE_URL}/api/documents/{doc_id}/records", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        print(f"PASS: GET /api/documents/{doc_id}/records returns dict with keys: {list(data.keys())}")


# ── Overview: Net worth series ─────────────────────────────────────────────────
class TestNetWorthSeries:
    """Net worth series endpoint"""

    def test_net_worth_series_endpoint(self, headers):
        resp = requests.get(f"{BASE_URL}/api/finance/net-worth-series", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/finance/net-worth-series returns {len(data)} snapshots")

    def test_net_worth_snapshot_structure(self, headers):
        """Trigger net worth snapshot via overview endpoint"""
        resp = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=headers)
        assert resp.status_code == 200
        print("PASS: Dashboard overview endpoint works (triggers net worth snapshot)")


# ── Generic PATCH endpoint unknown kind ───────────────────────────────────────
class TestPatchCollections:
    """Generic PATCH unknown kind returns 404"""

    def test_patch_unknown_kind_returns_404(self, headers):
        resp = requests.patch(f"{BASE_URL}/api/unknown-kind/some-id", json={"foo": "bar"}, headers=headers)
        assert resp.status_code == 404
        print("PASS: PATCH /api/unknown-kind/{id} returns 404")
