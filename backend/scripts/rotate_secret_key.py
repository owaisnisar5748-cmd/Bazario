from pathlib import Path
import os
import secrets
import tempfile

BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = BACKEND_DIR / ".env"


def replace_secret(lines, secret):
    next_lines = []
    replaced = False

    for line in lines:
        if line.startswith("SECRET_KEY="):
            next_lines.append(f"SECRET_KEY={secret}\n")
            replaced = True
        else:
            next_lines.append(line)

    if not replaced:
        if next_lines and not next_lines[-1].endswith("\n"):
            next_lines[-1] += "\n"
        next_lines.append(f"SECRET_KEY={secret}\n")

    return next_lines


def main():
    lines = ENV_PATH.read_text(encoding="utf-8").splitlines(keepends=True) if ENV_PATH.exists() else []
    secret = secrets.token_urlsafe(48)
    next_lines = replace_secret(lines, secret)

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=BACKEND_DIR,
        prefix=".env.",
        suffix=".tmp",
        delete=False,
    ) as temporary_file:
        temporary_file.writelines(next_lines)
        temporary_path = Path(temporary_file.name)

    os.replace(temporary_path, ENV_PATH)
    print("SECRET_KEY rotated successfully. Existing login sessions are now invalid.")


if __name__ == "__main__":
    main()
