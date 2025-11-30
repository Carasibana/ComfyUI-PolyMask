from .poly_mask_node import PolyMaskNode
from .poly_mask_node_multi import PolyMaskNodeMulti

NODE_CLASS_MAPPINGS = {
    "PolyMaskNode": PolyMaskNode,
    "PolyMaskNodeMulti": PolyMaskNodeMulti,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PolyMaskNode": "Poly Mask Loader",
    "PolyMaskNodeMulti": "Poly Mask Loader (Multi)",
}

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]