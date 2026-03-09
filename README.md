# py-warp-mosh

Turn a one-off image glitch script into a reusable cross-platform Python package and CLI.

## Install

```bash
pip install .
```

## Usage

```bash
py-warp-mosh input.png output.png --seed 42
```

If no arguments are provided, the app prints `--help` and exits.

Drag-and-drop support (Windows executable/shortcut):

- Drop **one file**: outputs `*_warped_datamosh_bitmap.png` next to the input.
- Drop **multiple files**: each file is processed with that same default output naming.
- Optional explicit output for a single input:

```bash
py-warp-mosh input.png --output output.png
```


## Web-friendly version (vanilla JS)

A browser-native implementation lives in `web/` and prioritizes **PNG, JPEG, and GIF** input (with broader format support depending on your browser, e.g. WebP/AVIF where available).

GitHub Pages deployment is automated via `.github/workflows/deploy-web-demo.yml` and publishes the `web/` directory when changes land on `main`.

After enabling **Settings → Pages → Build and deployment → GitHub Actions**, the demo will be available at:

```text
https://<org-or-user>.github.io/<repo>/
```

Use the UI to upload or drag/drop an image, set a seed, apply the effect, and download the result as PNG.

## Build single-file binaries locally

```bash
pip install .[dev]
pyinstaller --onefile --name py-warp-mosh scripts/pyinstaller_entrypoint.py
```

## Restricted package index / proxy environments

If your environment blocks public PyPI access, you have three practical options:

1. **Point pip to your internal mirror** (preferred):

```bash
export PIP_INDEX_URL="https://<your-internal-pypi>/simple"
export PIP_TRUSTED_HOST="<your-internal-pypi-host>"
python -m pip install --no-build-isolation -e .[dev]
```

2. **Use an explicit proxy** (if your org requires one):

```bash
export HTTPS_PROXY="http://<proxy-host>:<proxy-port>"
export HTTP_PROXY="http://<proxy-host>:<proxy-port>"
python -m pip install --no-build-isolation -e .[dev]
```

3. **Install from a prebuilt wheelhouse** (offline/air-gapped):

```bash
python -m pip install --no-index --find-links /path/to/wheels -e .[dev] --no-build-isolation
```

`--no-build-isolation` avoids creating a temporary build env that tries to re-download build tools like `setuptools`.

## CI binary bundles

GitHub Actions builds one-file binaries for:

- Linux (`ubuntu-latest`)
- macOS (`macos-latest`)
- Windows (`windows-latest`)

Artifacts are uploaded per platform on every push and pull request.
