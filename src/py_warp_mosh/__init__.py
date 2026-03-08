"""py-warp-mosh package."""

__all__ = ["WarpMoshConfig", "warp_mosh_image"]


def __getattr__(name: str):
    if name in __all__:
        from py_warp_mosh.core import WarpMoshConfig, warp_mosh_image

        exports = {
            "WarpMoshConfig": WarpMoshConfig,
            "warp_mosh_image": warp_mosh_image,
        }
        return exports[name]
    raise AttributeError(name)
