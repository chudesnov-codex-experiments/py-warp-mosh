import hashlib

import pytest

np = pytest.importorskip("numpy")
Image = pytest.importorskip("PIL.Image")

from py_warp_mosh.core import WarpMoshConfig, warp_mosh_image


def test_warp_mosh_image_writes_output(tmp_path):
    data = np.zeros((64, 64, 3), dtype=np.uint8)
    data[:, :, 0] = np.arange(64, dtype=np.uint8)[:, None]
    data[:, :, 1] = np.arange(64, dtype=np.uint8)[None, :]
    data[:, :, 2] = 128

    input_path = tmp_path / "in.png"
    output_path = tmp_path / "out.png"
    Image.fromarray(data, "RGB").save(input_path)

    result = warp_mosh_image(input_path, output_path, WarpMoshConfig(seed=42))

    assert result == output_path
    assert output_path.exists()

    digest = hashlib.sha256(output_path.read_bytes()).hexdigest()
    assert len(digest) == 64
