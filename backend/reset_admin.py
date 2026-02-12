"""
Reset/Create Platform Admin Script
Run with: python reset_admin.py
"""
import asyncio
import sys
import os

# Ensure we're in the right directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.getcwd())

from sqlalchemy import select
from app.db.database import async_session_maker
from app.models.platform_admin import PlatformAdmin
from app.core.security import get_password_hash


async def reset_platform_admin():
    """Reset/create the platform admin user"""

    # Default credentials
    email = "admin@lucent.com"
    password = "admin123"  # Change this in production!
    full_name = "Platform Admin"

    print("=" * 50)
    print("LUCENT Platform Admin Reset")
    print("=" * 50)

    async with async_session_maker() as session:
        # Check if admin exists
        result = await session.execute(
            select(PlatformAdmin).where(PlatformAdmin.email == email)
        )
        existing_admin = result.scalar_one_or_none()

        if existing_admin:
            print(f"Found existing admin: {existing_admin.email}")
            # Update password
            existing_admin.password_hash = get_password_hash(password)
            existing_admin.is_active = True
            await session.commit()
            print("Password has been reset.")
        else:
            # Create new admin
            new_admin = PlatformAdmin(
                email=email,
                password_hash=get_password_hash(password),
                full_name=full_name,
                is_active=True
            )
            session.add(new_admin)
            await session.commit()
            print(f"Created new platform admin: {email}")

        print()
        print("=" * 50)
        print("Platform Admin Credentials:")
        print("=" * 50)
        print(f"  Email:    {email}")
        print(f"  Password: {password}")
        print()
        print("Login at: http://localhost:3000/lucent/admin")
        print("=" * 50)


if __name__ == "__main__":
    asyncio.run(reset_platform_admin())
