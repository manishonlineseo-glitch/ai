"""Ed25519 signature VERIFICATION, no dependencies (RFC 8032 reference algorithm).

The app only ever verifies; signing happens on the owner's PC with deploy/release_tools.py and a private key that never
leaves it. Slow (about 0.1 s) but it runs once per update, on a 100 byte message.
"""
import hashlib

_P = 2 ** 255 - 19
_Q = 2 ** 252 + 27742317777372353535851937790883648493
_D = -121665 * pow(121666, _P - 2, _P) % _P


def _inv(x):
    return pow(x, _P - 2, _P)


def _recover_x(y, sign):
    if y >= _P:
        return None
    x2 = (y * y - 1) * _inv(_D * y * y + 1) % _P
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (_P + 3) // 8, _P)
    if (x * x - x2) % _P != 0:
        x = x * pow(2, (_P - 1) // 4, _P) % _P
    if (x * x - x2) % _P != 0:
        return None
    if (x & 1) != sign:
        x = _P - x
    return x


_GY = 4 * _inv(5) % _P
_GX = _recover_x(_GY, 0)
_G = (_GX, _GY, 1, _GX * _GY % _P)


def _add(p1, p2):
    a = (p1[1] - p1[0]) * (p2[1] - p2[0]) % _P
    b = (p1[1] + p1[0]) * (p2[1] + p2[0]) % _P
    c = 2 * p1[3] * p2[3] * _D % _P
    d = 2 * p1[2] * p2[2] % _P
    e, f, g, h = b - a, d - c, d + c, b + a
    return (e * f % _P, g * h % _P, f * g % _P, e * h % _P)


def _mul(s, point):
    q = (0, 1, 1, 0)
    while s > 0:
        if s & 1:
            q = _add(q, point)
        point = _add(point, point)
        s >>= 1
    return q


def _equal(p1, p2):
    return (p1[0] * p2[2] - p2[0] * p1[2]) % _P == 0 and (p1[1] * p2[2] - p2[1] * p1[2]) % _P == 0


def _decompress(s):
    if len(s) != 32:
        return None
    y = int.from_bytes(s, "little")
    sign = y >> 255
    y &= (1 << 255) - 1
    x = _recover_x(y, sign)
    if x is None:
        return None
    return (x, y, 1, x * y % _P)


def verify(public_key: bytes, message: bytes, signature: bytes) -> bool:
    """True only if `signature` is a valid Ed25519 signature of `message` under the 32-byte `public_key`."""
    try:
        if len(public_key) != 32 or len(signature) != 64:
            return False
        a = _decompress(public_key)
        r_bytes = signature[:32]
        r = _decompress(r_bytes)
        if a is None or r is None:
            return False
        s = int.from_bytes(signature[32:], "little")
        if s >= _Q:
            return False
        h = int.from_bytes(hashlib.sha512(r_bytes + public_key + message).digest(), "little") % _Q
        return _equal(_mul(s, _G), _add(r, _mul(h, a)))
    except Exception:
        return False


def release_message(platform: str, version: str, sha256_hex: str) -> bytes:
    """What the owner signs for one release: binds the platform, the version number and the file's hash together, so an old
    signed file cannot be passed off as a newer version and a signature for one platform is useless on the other."""
    return f"jarvis-release|{platform}|{version}|{sha256_hex}".encode("ascii")
