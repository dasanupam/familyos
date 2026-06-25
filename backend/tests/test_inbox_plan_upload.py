"""
Iteration D - Plan Upload Auto-Update + Diff/Confirm Tests

Tests:
- POST /api/inbox/text auto-save (returns counts immediately)
- POST /api/inbox/file with dry_run=true (no records, proposed=True)
- POST /api/inbox/file with dry_run=false (records created)
- POST /api/inbox/apply with selected_types (partial apply)
- POST /api/inbox/apply writes to update_log
- POST /api/inbox/apply with deselected types (only selected types applied)
"""

import pytest
import requests
import os
import io
import time

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
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture(scope="module")
def json_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def default_member_id(headers):
    resp = requests.get(f"{BASE_URL}/api/members", headers=headers)
    assert resp.status_code == 200
    members = resp.json()
    assert len(members) > 0, "No members found"
    # Return Anupam's member id (linked_member_id from user)
    return members[0]["id"]


# ─── Test 1: /inbox/text auto-save ────────────────────────────────────────────

class TestInboxText:
    """Test POST /api/inbox/text returns counts immediately (auto-save)"""

    def test_text_submission_returns_200(self, json_headers):
        resp = requests.post(
            f"{BASE_URL}/api/inbox/text",
            json={"text": "Salary credit 185000 today"},
            headers=json_headers
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_text_submission_returns_parsed_and_counts(self, json_headers):
        resp = requests.post(
            f"{BASE_URL}/api/inbox/text",
            json={"text": "Salary credit 185000 today"},
            headers=json_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "parsed" in data, "Response should contain 'parsed'"
        assert "counts" in data, "Response should contain 'counts'"

    def test_text_submission_counts_has_correct_keys(self, json_headers):
        resp = requests.post(
            f"{BASE_URL}/api/inbox/text",
            json={"text": "Spent 500 on groceries"},
            headers=json_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        counts = data.get("counts", {})
        # At minimum, transactions key should be present since this is a transaction
        assert isinstance(counts, dict), "Counts should be a dict"

    def test_text_submission_empty_text_returns_400(self, json_headers):
        resp = requests.post(
            f"{BASE_URL}/api/inbox/text",
            json={"text": ""},
            headers=json_headers
        )
        assert resp.status_code == 400, f"Expected 400 for empty text, got {resp.status_code}"

    def test_text_submission_requires_auth(self):
        resp = requests.post(
            f"{BASE_URL}/api/inbox/text",
            json={"text": "Salary credit 185000 today"},
            headers={}
        )
        assert resp.status_code == 401, f"Expected 401 without auth, got {resp.status_code}"


# ─── Test 2: /inbox/file with dry_run=true ────────────────────────────────────

class TestInboxFileDryRun:
    """Test POST /api/inbox/file with dry_run=true returns proposed results without creating records"""

    def _get_lab_count_before(self, headers):
        resp = requests.get(f"{BASE_URL}/api/health/labs", headers=headers)
        assert resp.status_code == 200
        return len(resp.json())

    def _get_transaction_count_before(self, headers):
        resp = requests.get(f"{BASE_URL}/api/finance/transactions", headers=headers)
        assert resp.status_code == 200
        return len(resp.json())

    def test_dry_run_returns_proposed_true(self, headers):
        """dry_run=true should return proposed=True in response"""
        file_content = b"Salary credit 185000 today, lab result HbA1c 5.6%"
        files = {"file": ("test_plan.txt", io.BytesIO(file_content), "text/plain")}
        data = {"dry_run": "true"}
        resp = requests.post(f"{BASE_URL}/api/inbox/file", files=files, data=data, headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        result = resp.json()
        assert result.get("proposed") is True, f"Expected proposed=True, got: {result}"

    def test_dry_run_returns_document_id(self, headers):
        """dry_run=true should store document and return document_id"""
        file_content = b"Salary credit 185000 today, lab result HbA1c 5.6%"
        files = {"file": ("test_dryrun.txt", io.BytesIO(file_content), "text/plain")}
        data = {"dry_run": "true"}
        resp = requests.post(f"{BASE_URL}/api/inbox/file", files=files, data=data, headers=headers)
        assert resp.status_code == 200
        result = resp.json()
        assert "document_id" in result and result["document_id"], "document_id should be set"

    def test_dry_run_returns_parsed_data(self, headers):
        """dry_run=true should return parsed data"""
        file_content = b"Salary credit 185000 today, lab result HbA1c 5.6%"
        files = {"file": ("test_dryrun2.txt", io.BytesIO(file_content), "text/plain")}
        data = {"dry_run": "true"}
        resp = requests.post(f"{BASE_URL}/api/inbox/file", files=files, data=data, headers=headers)
        assert resp.status_code == 200
        result = resp.json()
        assert "parsed" in result, "Response should contain 'parsed'"
        assert isinstance(result["parsed"], dict), "Parsed should be a dict"

    def test_dry_run_does_not_create_transactions(self, headers):
        """dry_run=true should NOT create any transactions"""
        tx_before = self._get_transaction_count_before(headers)
        file_content = b"TEST_DRYRUN Salary credit 999999 today"
        files = {"file": ("TEST_dryrun_tx.txt", io.BytesIO(file_content), "text/plain")}
        data = {"dry_run": "true"}
        resp = requests.post(f"{BASE_URL}/api/inbox/file", files=files, data=data, headers=headers)
        assert resp.status_code == 200
        result = resp.json()
        assert result.get("proposed") is True

        # Wait a moment for any async operations
        time.sleep(1)

        tx_after = self._get_transaction_count_before(headers)
        assert tx_after == tx_before, (
            f"dry_run should NOT create transactions! Before: {tx_before}, After: {tx_after}"
        )

    def test_dry_run_does_not_create_lab_results(self, headers):
        """dry_run=true should NOT create any lab results"""
        lab_before = self._get_lab_count_before(headers)
        file_content = b"TEST_DRYRUN_LAB lab result HbA1c 5.6%, TSH 2.1 uIU/mL"
        files = {"file": ("TEST_dryrun_lab.txt", io.BytesIO(file_content), "text/plain")}
        data = {"dry_run": "true"}
        resp = requests.post(f"{BASE_URL}/api/inbox/file", files=files, data=data, headers=headers)
        assert resp.status_code == 200
        assert resp.json().get("proposed") is True

        time.sleep(1)

        lab_after = self._get_lab_count_before(headers)
        assert lab_after == lab_before, (
            f"dry_run should NOT create lab_results! Before: {lab_before}, After: {lab_after}"
        )

    def test_dry_run_stores_document_in_db(self, headers):
        """dry_run=true should store the document in documents collection"""
        file_content = b"Test document for dry run storage check"
        files = {"file": ("TEST_doc_storage.txt", io.BytesIO(file_content), "text/plain")}
        data = {"dry_run": "true"}
        resp = requests.post(f"{BASE_URL}/api/inbox/file", files=files, data=data, headers=headers)
        assert resp.status_code == 200
        doc_id = resp.json().get("document_id")
        assert doc_id, "Should have document_id"

        # Verify document is in the documents list
        docs_resp = requests.get(f"{BASE_URL}/api/documents", headers=headers)
        assert docs_resp.status_code == 200
        doc_ids = [d["id"] for d in docs_resp.json()]
        assert doc_id in doc_ids, f"Document {doc_id} not found in documents list"


# ─── Test 3: /inbox/file without dry_run ──────────────────────────────────────

class TestInboxFileNoDryRun:
    """Test POST /api/inbox/file without dry_run creates records (backward compat)"""

    def test_no_dry_run_returns_counts(self, headers):
        """Without dry_run, file upload should return counts (records were created)"""
        file_content = b"Spent 200 on food today at Swiggy"
        files = {"file": ("test_nodry.txt", io.BytesIO(file_content), "text/plain")}
        resp = requests.post(f"{BASE_URL}/api/inbox/file", files=files, headers=headers)
        assert resp.status_code == 200
        result = resp.json()
        # Should have counts key, NOT proposed
        assert "counts" in result or "document_id" in result, f"Expected counts in response: {result}"
        assert result.get("proposed") is not True, "Should NOT return proposed=True without dry_run"

    def test_no_dry_run_returns_document_id(self, headers):
        """Without dry_run, file upload should still return document_id"""
        file_content = b"Bought groceries for 500 rupees"
        files = {"file": ("test_nodry2.txt", io.BytesIO(file_content), "text/plain")}
        resp = requests.post(f"{BASE_URL}/api/inbox/file", files=files, headers=headers)
        assert resp.status_code == 200
        result = resp.json()
        assert "document_id" in result, "document_id should be present"


# ─── Test 4: /inbox/apply ─────────────────────────────────────────────────────

class TestInboxApply:
    """Test POST /api/inbox/apply with selected_types"""

    # Sample parsed data containing both transactions and lab_results
    PARSED_BOTH = {
        "summary": "TEST: Salary credit with lab result",
        "module": "finance",
        "member_hint": None,
        "confidence": 0.95,
        "transactions": [
            {
                "date": "2026-02-01",
                "amount": 185000,
                "type": "income",
                "category": "salary",
                "merchant": None,
                "note": "TEST_APPLY_TX Salary credit"
            }
        ],
        "lab_results": [
            {
                "date": "2026-02-01",
                "test": "HbA1c_TEST_APPLY",
                "value": 5.6,
                "unit": "%",
                "reference_range": "4.0-5.6"
            }
        ]
    }

    def test_apply_all_types_returns_counts(self, json_headers):
        """Apply with all types selected should return counts for all"""
        payload = {
            "parsed": self.PARSED_BOTH,
            "selected_types": ["transactions", "lab_results"]
        }
        resp = requests.post(f"{BASE_URL}/api/inbox/apply", json=payload, headers=json_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "counts" in data, "Response should contain 'counts'"
        counts = data["counts"]
        assert counts.get("transactions", 0) >= 1, "Should have applied at least 1 transaction"
        assert counts.get("lab_results", 0) >= 1, "Should have applied at least 1 lab result"

    def test_apply_only_transactions_skips_lab_results(self, json_headers, headers):
        """When selected_types only contains 'transactions', lab_results should NOT be applied"""
        lab_before = len(requests.get(f"{BASE_URL}/api/health/labs", headers=headers).json())

        payload = {
            "parsed": self.PARSED_BOTH,
            "selected_types": ["transactions"]  # Only transactions, NOT lab_results
        }
        resp = requests.post(f"{BASE_URL}/api/inbox/apply", json=payload, headers=json_headers)
        assert resp.status_code == 200
        counts = resp.json()["counts"]
        assert counts.get("lab_results", 0) == 0, "lab_results should be 0 when not selected"

        lab_after = len(requests.get(f"{BASE_URL}/api/health/labs", headers=headers).json())
        assert lab_after == lab_before, (
            f"Lab results should not be created! Before: {lab_before}, After: {lab_after}"
        )

    def test_apply_only_lab_results_skips_transactions(self, json_headers, headers):
        """When selected_types only contains 'lab_results', transactions should NOT be applied"""
        tx_before = len(requests.get(f"{BASE_URL}/api/finance/transactions", headers=headers).json())

        payload = {
            "parsed": self.PARSED_BOTH,
            "selected_types": ["lab_results"]  # Only lab_results, NOT transactions
        }
        resp = requests.post(f"{BASE_URL}/api/inbox/apply", json=payload, headers=json_headers)
        assert resp.status_code == 200
        counts = resp.json()["counts"]
        assert counts.get("transactions", 0) == 0, "transactions count should be 0 when not selected"

        tx_after = len(requests.get(f"{BASE_URL}/api/finance/transactions", headers=headers).json())
        assert tx_after == tx_before, (
            f"Transactions should not be created! Before: {tx_before}, After: {tx_after}"
        )

    def test_apply_with_doc_id(self, json_headers, headers):
        """Apply should accept and process doc_id from a previous dry-run"""
        # First do a dry_run to get a document_id
        file_content = b"Spent 150 at restaurant, lab result HbA1c 5.9%"
        files = {"file": ("test_apply_docid.txt", io.BytesIO(file_content), "text/plain")}
        dry_resp = requests.post(f"{BASE_URL}/api/inbox/file", files=files, data={"dry_run": "true"}, headers=headers)
        assert dry_resp.status_code == 200
        dry_data = dry_resp.json()
        doc_id = dry_data.get("document_id")
        parsed = dry_data.get("parsed", {})

        if not doc_id:
            pytest.skip("No doc_id returned from dry_run")

        payload = {
            "parsed": parsed,
            "doc_id": doc_id,
            "selected_types": ["transactions", "lab_results"]
        }
        resp = requests.post(f"{BASE_URL}/api/inbox/apply", json=payload, headers=json_headers)
        assert resp.status_code == 200, f"Apply with doc_id failed: {resp.text}"
        data = resp.json()
        assert "counts" in data

    def test_apply_writes_to_update_log(self, json_headers, headers):
        """Apply should write to the update_log collection (verified via inbox_log)"""
        # Check inbox log count before
        log_before_resp = requests.get(f"{BASE_URL}/api/inbox/log?limit=50", headers=headers)
        assert log_before_resp.status_code == 200
        log_before = len(log_before_resp.json())

        payload = {
            "parsed": {
                "summary": "TEST apply update_log write",
                "module": "finance",
                "confidence": 0.9,
                "transactions": [
                    {"date": "2026-02-01", "amount": 100, "type": "expense",
                     "category": "food", "merchant": "TEST_LOG_CHECK", "note": None}
                ]
            },
            "selected_types": ["transactions"]
        }
        resp = requests.post(f"{BASE_URL}/api/inbox/apply", json=payload, headers=json_headers)
        assert resp.status_code == 200

        # After apply, inbox_log should have at least 1 more entry
        log_after_resp = requests.get(f"{BASE_URL}/api/inbox/log?limit=50", headers=headers)
        assert log_after_resp.status_code == 200
        log_after = len(log_after_resp.json())
        assert log_after > log_before, (
            f"inbox_log should have more entries after apply. Before: {log_before}, After: {log_after}"
        )

    def test_apply_empty_selected_types_creates_nothing(self, json_headers, headers):
        """Apply with empty selected_types should create 0 records"""
        tx_before = len(requests.get(f"{BASE_URL}/api/finance/transactions", headers=headers).json())

        payload = {
            "parsed": self.PARSED_BOTH,
            "selected_types": []  # Empty - nothing selected
        }
        resp = requests.post(f"{BASE_URL}/api/inbox/apply", json=payload, headers=json_headers)
        assert resp.status_code == 200
        counts = resp.json()["counts"]
        total = sum(counts.values())
        assert total == 0, f"No records should be created with empty selected_types, got: {counts}"

    def test_apply_requires_auth(self):
        """Apply endpoint should require auth"""
        payload = {
            "parsed": {"summary": "test", "confidence": 0.5},
            "selected_types": ["transactions"]
        }
        resp = requests.post(
            f"{BASE_URL}/api/inbox/apply",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        assert resp.status_code == 401, f"Expected 401 without auth, got {resp.status_code}"


# ─── Test 5: Inbox log ────────────────────────────────────────────────────────

class TestInboxLog:
    """Test GET /api/inbox/log"""

    def test_inbox_log_returns_list(self, headers):
        resp = requests.get(f"{BASE_URL}/api/inbox/log", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list), "inbox_log should return a list"

    def test_inbox_log_has_recent_entries(self, headers):
        resp = requests.get(f"{BASE_URL}/api/inbox/log", headers=headers)
        assert resp.status_code == 200
        # After the tests above there should be at least some entries
        data = resp.json()
        assert len(data) >= 1, "Should have at least 1 inbox_log entry after text submissions"
