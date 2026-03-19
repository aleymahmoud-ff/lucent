from pydantic import BaseModel


class MessageResponse(BaseModel):
    """Standard response for endpoints that return a simple message."""
    message: str