from pathlib import Path

import pytest

from py_warp_mosh import cli


def test_main_without_args_prints_help(capsys):
    assert cli.main([]) == 0
    out = capsys.readouterr().out
    assert "usage:" in out


def test_main_single_input_uses_default_output(monkeypatch, tmp_path, capsys):
    calls = []

    def fake_processor(input_path: Path, output_path: Path, seed: int, intensity: float = 0.5) -> Path:
        calls.append((input_path, output_path, seed, intensity))
        return output_path

    monkeypatch.setattr(cli, "_default_processor", fake_processor)

    input_path = tmp_path / "photo.png"
    input_path.write_bytes(b"x")

    assert cli.main([str(input_path), "--seed", "7"]) == 0
    assert calls == [
        (
            input_path,
            tmp_path / "photo_warped_datamosh_bitmap.png",
            7,
            0.5,
        )
    ]
    assert "Saved:" in capsys.readouterr().out


def test_main_output_option_requires_single_input():
    with pytest.raises(SystemExit) as exc_info:
        cli.main(["a.png", "b.png", "--output", "out.png"])

    assert exc_info.value.code == 2
