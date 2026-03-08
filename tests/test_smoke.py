from pathlib import Path


def test_project_layout_has_core_module():
    assert Path("src/py_warp_mosh/core.py").exists()
