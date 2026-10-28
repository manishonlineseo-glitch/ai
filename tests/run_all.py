"""Runs every test suite and writes tests/last_run.json (the system docs quote it).

  agent\venv\Scripts\python.exe tests\run_all.py            server + agent tests (offline, safe)
  agent\venv\Scripts\python.exe tests\run_all.py --live     also the public live-site smoke test
"""
import datetime
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


class Counting(unittest.TextTestResult):
    subtests = 0

    def addSubTest(self, test, subtest, err):
        Counting.subtests += 1
        super().addSubTest(test, subtest, err)


def run(name):
    suite = unittest.defaultTestLoader.loadTestsFromName(name)
    Counting.subtests = 0
    res = unittest.TextTestRunner(verbosity=1, resultclass=Counting, stream=sys.stdout).run(suite)
    return {"tests": res.testsRun, "subchecks": Counting.subtests, "failures": len(res.failures), "errors": len(res.errors),
            "skipped": len(res.skipped), "ok": res.wasSuccessful()}


def main():
    names = ["server_test", "agent_test", "security_test", "content_test"] + (["live_smoke"] if "--live" in sys.argv else [])
    out = {"date": datetime.datetime.now().astimezone().isoformat(timespec="seconds"), "suites": {}}
    for n in names:
        print(f"\n=== {n} ===")
        out["suites"][n] = run(n)
    out["total_tests"] = sum(s["tests"] for s in out["suites"].values())
    out["total_subchecks"] = sum(s["subchecks"] for s in out["suites"].values())
    out["all_ok"] = all(s["ok"] for s in out["suites"].values())
    with open(os.path.join(HERE, "last_run.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print("\n" + json.dumps(out, indent=2))
    sys.exit(0 if out["all_ok"] else 1)


if __name__ == "__main__":
    main()
