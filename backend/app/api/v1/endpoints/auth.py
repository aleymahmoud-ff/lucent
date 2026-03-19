"""
Authentication Endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime
import uuid

from app.core.deps import get_db, get_current_active_user
from app.core.security import verify_password, get_password_hash, create_access_token
from app.schemas.auth import UserRegister, UserLogin, AuthResponse, UserResponse, TenantAccessRequest
from app.schemas import MessageResponse
from app.models.user import User, UserRole
from app.models.tenant import Tenant

router = APIRouter()


def build_user_response(user: User, tenant_slug: str = None) -> UserResponse:
    """Helper to build UserResponse with tenant_slug"""
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        tenant_id=user.tenant_id,
        tenant_slug=tenant_slug or (user.tenant.slug if user.tenant else None),
        is_active=user.is_active,
        is_approved=user.is_approved,
        created_at=user.created_at,
        last_login=user.last_login
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new user and create a new tenant

    - Creates a new tenant organization
    - Creates the first admin user for that tenant
    - Returns access token and user info
    """
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create tenant
    tenant_slug = user_data.tenant_name.lower().replace(" ", "-").replace("_", "-")

    # Check if tenant slug exists
    result = await db.execute(select(Tenant).where(Tenant.slug == tenant_slug))
    existing_tenant = result.scalar_one_or_none()

    if existing_tenant:
        # Append random string to make it unique
        tenant_slug = f"{tenant_slug}-{str(uuid.uuid4())[:8]}"

    tenant = Tenant(
        name=user_data.tenant_name,
        slug=tenant_slug
    )
    db.add(tenant)
    await db.flush()  # Get tenant.id

    # Create user (first user is admin and auto-approved)
    hashed_password = get_password_hash(user_data.password)
    user = User(
        tenant_id=tenant.id,
        email=user_data.email,
        password_hash=hashed_password,
        full_name=user_data.full_name,
        role=UserRole.ADMIN,  # First user is admin
        is_approved=True,  # First user (tenant creator) is auto-approved
        last_login=datetime.utcnow()
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Create access token
    access_token = create_access_token(data={"sub": user.id})

    return AuthResponse(
        access_token=access_token,
        token_type="bearer",
        user=build_user_response(user, tenant.slug)
    )


@router.post("/login", response_model=AuthResponse)
async def login(
    credentials: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """
    Login with email and password (generic - no tenant validation)

    - Validates credentials
    - Returns access token and user info

    Note: For tenant-specific login with validation, use /tenant/{tenant_slug}/login
    """
    # Get user with tenant relationship
    result = await db.execute(
        select(User).options(selectinload(User.tenant)).where(User.email == credentials.email)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify password
    if not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    # Check if user is approved
    if not user.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is pending approval. Please wait for an administrator to approve your registration."
        )

    # Update last login
    user.last_login = datetime.utcnow()
    await db.commit()
    await db.refresh(user)

    # Create access token
    access_token = create_access_token(data={"sub": user.id})

    return AuthResponse(
        access_token=access_token,
        token_type="bearer",
        user=build_user_response(user)
    )


@router.post("/tenant/{tenant_slug}/login", response_model=AuthResponse)
async def tenant_login(
    tenant_slug: str,
    credentials: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """
    Tenant-specific login with validation

    - Validates that the tenant exists and is active
    - Validates user credentials
    - Validates that the user belongs to the specified tenant
    - Returns access token and user info
    """
    # First, verify the tenant exists and is active
    result = await db.execute(select(Tenant).where(Tenant.slug == tenant_slug))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )

    if not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization is not active"
        )

    # Get user with tenant relationship
    result = await db.execute(
        select(User).options(selectinload(User.tenant)).where(User.email == credentials.email)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify password
    if not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # CRITICAL: Validate user belongs to this tenant
    if user.tenant_id != tenant.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this organization"
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    # Check if user is approved
    if not user.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is pending approval. Please wait for an administrator to approve your registration."
        )

    # Update last login
    user.last_login = datetime.utcnow()
    await db.commit()
    await db.refresh(user)

    # Create access token
    access_token = create_access_token(data={"sub": user.id})

    return AuthResponse(
        access_token=access_token,
        token_type="bearer",
        user=build_user_response(user, tenant.slug)
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_active_user)
):
    """
    Get current user info
    """
    return build_user_response(current_user)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    current_user: User = Depends(get_current_active_user)
):
    """
    Logout (client should delete the token)
    """
    return {"message": "Successfully logged out"}


@router.get("/pending-users", response_model=list[UserResponse])
async def get_pending_users(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all pending users for the current tenant (admin only)
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can view pending users"
        )

    # Get tenant slug for responses
    tenant_slug = current_user.tenant.slug if current_user.tenant else None

    result = await db.execute(
        select(User).where(
            User.tenant_id == current_user.tenant_id,
            User.is_approved == False
        )
    )
    users = result.scalars().all()
    return [build_user_response(u, tenant_slug) for u in users]


@router.post("/approve-user/{user_id}", response_model=UserResponse)
async def approve_user(
    user_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Approve a pending user (admin only)
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can approve users"
        )

    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.tenant_id == current_user.tenant_id
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    user.is_approved = True
    await db.commit()
    await db.refresh(user)

    # Get tenant slug for response
    tenant_slug = current_user.tenant.slug if current_user.tenant else None
    return build_user_response(user, tenant_slug)


@router.post("/reject-user/{user_id}", response_model=MessageResponse)
async def reject_user(
    user_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Reject and delete a pending user (admin only)
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can reject users"
        )

    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.tenant_id == current_user.tenant_id,
            User.is_approved == False
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pending user not found"
        )

    await db.delete(user)
    await db.commit()

    return {"message": "User rejected and removed"}


@router.post("/request-access", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def request_tenant_access(
    request_data: TenantAccessRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Request access to an existing tenant

    - Creates a new user with is_approved=False
    - User will need admin approval to login
    """
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == request_data.email))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Find tenant by slug
    result = await db.execute(select(Tenant).where(Tenant.slug == request_data.tenant_slug))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )

    if not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization is not active"
        )

    # Create user with is_approved=False (needs admin approval)
    hashed_password = get_password_hash(request_data.password)
    user = User(
        tenant_id=tenant.id,
        email=request_data.email,
        password_hash=hashed_password,
        full_name=request_data.full_name,
        role=UserRole.ANALYST,  # Default role for new users
        is_approved=False,  # Requires admin approval
        is_active=True
    )
    db.add(user)
    await db.commit()

    return {"message": "Access request submitted. Please wait for admin approval."}
