"""
BVC SMART PORTAL - CONCURRENT LOAD & STRESS TEST
Benchmarks throughput, latency percentiles, and database lock resilience
under SQLite WAL mode (Write-Ahead Logging) and connection pooling.
"""

import time
import statistics
import concurrent.futures
import server

def run_load_test(num_requests=300, max_workers=25):
    print("=" * 65)
    print("BVC SMART PORTAL - CONCURRENCY & LOAD TEST")
    print(f"Target Requests: {num_requests} | Concurrency (Threads): {max_workers}")
    print("Database: SQLite with WAL mode & Foreign Keys enabled")
    print("=" * 65)

    app = server.app
    app.config['TESTING'] = True
    client = app.test_client()

    # Pre-generate valid tokens for realistic authenticated traffic
    admin_tok = server.make_token("ADMIN", "admin", "System Administrator")
    student_tok = server.make_token("25221A0556", "student", "Sai Charan")
    faculty_tok = server.make_token("Krishnaveni Madam", "faculty", "Krishnaveni Madam")

    # Define test scenarios (mixed real-world read/write workload)
    scenarios = [
        ("GET", "/api/health", None, None),
        ("GET", "/api/admin/branches", {'X-Auth-Token': admin_tok}, None),
        ("GET", "/api/notifications", {'X-Auth-Token': student_tok}, None),
        ("GET", "/api/bus/details", None, None),
        ("GET", "/api/library/search?q=Python", None, None),
        ("GET", "/api/student/dashboard", {'X-Auth-Token': student_tok}, None),
        ("GET", "/api/timetable/CSE-A", {'X-Auth-Token': student_tok}, None),
        ("GET", "/api/admin/registry", {'X-Auth-Token': admin_tok}, None),
        ("POST", "/api/ai_chat", {'X-Auth-Token': student_tok}, {'message': 'What are the college timings?'}),
    ]

    latencies = []
    status_codes = {}
    db_lock_errors = 0
    errors = 0

    def execute_request(req_id):
        nonlocal db_lock_errors, errors
        method, url, headers, payload = scenarios[req_id % len(scenarios)]
        start = time.perf_counter()
        try:
            if method == "GET":
                res = client.get(url, headers=headers)
            else:
                res = client.post(url, headers=headers, json=payload)
            elapsed = (time.perf_counter() - start) * 1000.0  # ms
            
            code = res.status_code
            status_codes[code] = status_codes.get(code, 0) + 1
            if code not in (200, 201, 304):
                if "locked" in (res.get_data(as_text=True) or "").lower():
                    db_lock_errors += 1
                else:
                    errors += 1
            return elapsed
        except Exception as ex:
            if "database is locked" in str(ex).lower():
                db_lock_errors += 1
            else:
                errors += 1
            return None

    overall_start = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(execute_request, i) for i in range(num_requests)]
        for f in concurrent.futures.as_completed(futures):
            res = f.result()
            if res is not None:
                latencies.append(res)
    overall_time = time.perf_counter() - overall_start

    rps = num_requests / overall_time if overall_time > 0 else 0
    avg_latency = statistics.mean(latencies) if latencies else 0
    p50_latency = statistics.median(latencies) if latencies else 0
    p95_latency = statistics.quantiles(latencies, n=100)[94] if len(latencies) >= 100 else max(latencies)
    p99_latency = statistics.quantiles(latencies, n=100)[98] if len(latencies) >= 100 else max(latencies)
    min_latency = min(latencies) if latencies else 0
    max_latency = max(latencies) if latencies else 0

    print("\nRESULTS SUMMARY:")
    print("-" * 65)
    print(f"Total Requests Completed : {len(latencies)} / {num_requests}")
    print(f"Total Test Duration      : {overall_time:.3f} seconds")
    print(f"Effective Throughput     : {rps:.1f} Requests / Second")
    print(f"Database Locks Encountered: {db_lock_errors} (Target: 0)")
    print(f"Other Request Errors     : {errors}")
    print("-" * 65)
    print("LATENCY DISTRIBUTION (Milliseconds):")
    print(f"  Min Latency            : {min_latency:.2f} ms")
    print(f"  Average Latency        : {avg_latency:.2f} ms")
    print(f"  Median (p50) Latency   : {p50_latency:.2f} ms")
    print(f"  95th Percentile (p95)  : {p95_latency:.2f} ms")
    print(f"  99th Percentile (p99)  : {p99_latency:.2f} ms")
    print(f"  Max Latency            : {max_latency:.2f} ms")
    print("-" * 65)
    print(f"Status Code Breakdown    : {status_codes}")
    print("=" * 65)

    return {
        "num_requests": num_requests,
        "max_workers": max_workers,
        "total_time": overall_time,
        "rps": rps,
        "avg_latency": avg_latency,
        "p50_latency": p50_latency,
        "p95_latency": p95_latency,
        "p99_latency": p99_latency,
        "min_latency": min_latency,
        "max_latency": max_latency,
        "db_lock_errors": db_lock_errors,
        "errors": errors,
        "status_codes": status_codes
    }

if __name__ == '__main__':
    run_load_test(num_requests=300, max_workers=25)
