import requests

def test_signup():
    url = "http://localhost:5001/api/auth/signup"
    # Use a unique email to avoid "User already exists" error
    import time
    unique_email = f"testuser_{int(time.time())}@example.com"
    data = {
        "name": "Test User",
        "email": unique_email,
        "password": "testpassword123"
    }
    
    print(f"Testing signup with email: {unique_email}")
    try:
        response = requests.post(url, json=data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    test_signup()
