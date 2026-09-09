import httpx
import asyncio

async def test_add_expense():
    # first we need a user token. The user might have one or we need to login/signup.
    # Let's see if we can create a user and login to get the token.
    async with httpx.AsyncClient() as client:
        # Create user
        signup_res = await client.post("http://localhost:8000/api/users/signup", json={"email": "test@test.com", "password": "password"})
        print("Signup:", signup_res.text)
        
        # Login
        login_res = await client.post("http://localhost:8000/api/users/login", data={"username": "test@test.com", "password": "password"})
        print("Login:", login_res.text)
        if login_res.status_code == 200:
            token = login_res.json()["access_token"]
            
            # Get Rates
            rates_res = await client.get("http://localhost:8000/api/expenses/rates")
            print("Rates:", rates_res.json())

            # Add Expense
            headers = {"Authorization": f"Bearer {token}"}
            expense_data = {
                "amount": 100,
                "description": "Test expense",
                "category": "Food",
                "currency": "BS_USD"
            }
            exp_res = await client.post("http://localhost:8000/api/expenses/", json=expense_data, headers=headers)
            print("Expense:", exp_res.json())

if __name__ == "__main__":
    asyncio.run(test_add_expense())
