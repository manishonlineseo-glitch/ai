"""Owner-side release tool: makes the signing key, signs and publishes a new Windows or Android app.

Needs `pip install cryptography` on THIS PC only (the apps themselves only verify and need nothing).

  python deploy\\release_tools.py keygen                      one time: makes the key pair, prints the public key to embed in the apps
  python deploy\\release_tools.py publish windows             signs agent\\dist\\JarvisAgent.exe and uploads it
  python deploy\\release_tools.py publish android <file.apk> <versionCode> <versionName>

The PRIVATE key lives in %USERPROFILE%\\.jarvis_signing\\release_ed25519.pem. It is never uploaded and never goes into git.
Back it up somewhere safe (a USB stick): without it you cannot publish updates any more (you would have to install a new app by hand).
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "agent"))
import ed25519  # noqa: E402

KEY_DIR = os.path.join(os.path.expanduser("~"), ".jarvis_signing")
KEY_PATH = os.path.join(KEY_DIR, "release_ed25519.pem")
SSH_KEY = os.path.join(os.path.expanduser("~"), ".ssh", "hostinger_ed25519")
SERVER = "u204605465@91.108.107.206"
DOWNLOADS = "jarvis_data/downloads"


def load_private():
    from cryptography.hazmat.primitives import serialization
    with open(KEY_PATH, "rb") as f:
        return serialization.load_pem_private_key(f.read(), password=None)


def public_hex(private):
    from cryptography.hazmat.primitives import serialization
    return private.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw).hex()


def keygen():
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    if os.path.exists(KEY_PATH):
        sys.exit(f"{KEY_PATH} already exists: refusing to overwrite the signing key.")
    os.makedirs(KEY_DIR, exist_ok=True)
    key = Ed25519PrivateKey.generate()
    with open(KEY_PATH, "wb") as f:
        f.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    print("Private key saved:", KEY_PATH)
    print("PUBLIC KEY (put this in agent/ops.py UPDATE_PUBKEY and Updater.kt PUBLIC_KEY_HEX):")
    print(public_hex(key))


def sign(platform, version, sha256_hex):
    private = load_private()
    sig = private.sign(ed25519.release_message(platform, version, sha256_hex))
    assert ed25519.verify(bytes.fromhex(public_hex(private)), ed25519.release_message(platform, version, sha256_hex), sig)
    return sig.hex()


def run(cmd, **kw):
    out = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if out.returncode != 0:
        sys.exit(f"FAILED: {' '.join(cmd[:3])}...\n{out.stderr}")
    return out.stdout


def publish(platform, file_path, entry):
    sha = hashlib.sha256(open(file_path, "rb").read()).hexdigest()
    entry["sha256"] = sha
    version = entry["version"] if platform == "windows" else str(entry["code"])
    entry["signature"] = sign(platform, version, sha)
    remote_name = entry["file"]
    print(f"{platform} {version} sha256={sha[:16]}... signed")
    base = ["-i", SSH_KEY, "-o", "BatchMode=yes"]
    run(["scp", *base, "-P", "65002", file_path, f"{SERVER}:{DOWNLOADS}/{remote_name}.new"])
    # versions.json is merged on the server and swapped in only after the uploaded file's hash matches
    script = (
        "import json,hashlib,os,sys\n"
        f"d=os.path.expanduser('~/{DOWNLOADS}')\n"
        f"new=os.path.join(d,'{remote_name}.new')\n"
        f"assert hashlib.sha256(open(new,'rb').read()).hexdigest()=='{sha}','upload hash mismatch'\n"
        "m=json.load(open(os.path.join(d,'versions.json')))\n"
        f"m[{platform!r}]=json.loads({json.dumps(json.dumps(entry))})\n"
        "json.dump(m,open(os.path.join(d,'versions.json.new'),'w'))\n"
        f"os.replace(new,os.path.join(d,'{remote_name}'))\n"
        "os.replace(os.path.join(d,'versions.json.new'),os.path.join(d,'versions.json'))\n"
        "os.chmod(os.path.join(d,'versions.json'),0o600)\n"
        f"os.chmod(os.path.join(d,'{remote_name}'),0o600)\n"
        "print('published')\n"
    )
    print(run(["ssh", *base, "-p", "65002", SERVER, "python3 -"], input=script).strip())


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd = sys.argv[1]
    if cmd == "keygen":
        return keygen()
    if cmd == "publish" and sys.argv[2:3] == ["windows"]:
        exe = os.path.join(ROOT, "agent", "dist", "JarvisAgent.exe")
        version = re.search(r'^VERSION = "([\d.]+)"', open(os.path.join(ROOT, "agent", "ops.py"), encoding="utf-8").read(), re.M).group(1)
        return publish("windows", exe, {"version": version, "file": "JarvisAgent.exe"})
    if cmd == "publish" and sys.argv[2:3] == ["android"] and len(sys.argv) == 6:
        return publish("android", sys.argv[3], {"code": int(sys.argv[4]), "name": sys.argv[5], "file": "Jarvis.apk"})
    sys.exit(__doc__)


if __name__ == "__main__":
    main()
