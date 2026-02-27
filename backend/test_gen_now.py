import requests

def run():
    payload = {
        "topic": "Explain relativity",
        "content_type": "Explanation",
        "user_id": "test_user_backend@gmail.com",
        "mode": "standard"
    }
    try:
        res = requests.post("http://127.0.0.1:5001/api/generate", json=payload, timeout=30)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text}")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    run()
