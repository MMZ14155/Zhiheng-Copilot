from fastapi import HTTPException


def bad_request(detail: str, code: str = "BAD_REQUEST") -> HTTPException:
    return HTTPException(status_code=400, detail={"detail": detail, "code": code})


def not_found(detail: str, code: str = "NOT_FOUND") -> HTTPException:
    return HTTPException(status_code=404, detail={"detail": detail, "code": code})


def conflict(detail: str, code: str = "CONFLICT") -> HTTPException:
    return HTTPException(status_code=409, detail={"detail": detail, "code": code})


def payload_too_large(detail: str, code: str = "PAYLOAD_TOO_LARGE") -> HTTPException:
    return HTTPException(status_code=413, detail={"detail": detail, "code": code})


def unsupported_media_type(detail: str, code: str = "UNSUPPORTED_MEDIA_TYPE") -> HTTPException:
    return HTTPException(status_code=415, detail={"detail": detail, "code": code})

def unauthorized(detail: str = "请先登录") -> HTTPException:
    return HTTPException(status_code=401, detail={"detail": detail, "code": "UNAUTHORIZED"})

def forbidden(detail: str = "无权执行此操作") -> HTTPException:
    return HTTPException(status_code=403, detail={"detail": detail, "code": "FORBIDDEN"})
